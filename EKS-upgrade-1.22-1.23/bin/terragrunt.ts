import { isEmpty } from 'lodash'
import { $, argv, cd, fs, question } from 'zx'
import { Config } from './config'
import { Exit } from './exit'
import { Git } from './git'
import { Logger } from './logger'
import { Utils } from './utils'

class Terragrunt {
  static async upgrade(endo: string, awsProfile: string) {
    let rootDirectoryPath = argv['root-directory']

    if (isEmpty(rootDirectoryPath)) {
      rootDirectoryPath = '/tmp/eks-scripts-dir'
      Logger.debug(`${'root-directory'} not set. Using default ${rootDirectoryPath}`)
    }

    await $`mkdir -p ${rootDirectoryPath}`

    const repositoryName = `endo-${endo}`
    await this.run(rootDirectoryPath, repositoryName, awsProfile)

    const targetDirectoryPath = `${rootDirectoryPath}/${repositoryName}`
    await Git.openPr(targetDirectoryPath)
  }

  private static async run(rootDirectoryPath: string, repositoryName: string, awsProfileMainAccount: string) {
    const currentDir = (await $`pwd`).stdout.trim()

    await Utils.checkRequiredProgramsExist(['git', 'terragrunt', 'terraform', 'aws'])

    const targetDirectoryPath = `${rootDirectoryPath}/${repositoryName}`

    Logger.info('⌛ cluster upgrade via terraform')

    if (argv['delete-existing-directory']) {
      Logger.debug(`Deleting ${targetDirectoryPath} since '--delete-existing-directory' was set`)
      await $`rm -rf ${targetDirectoryPath}`
    }

    if (!(await fs.pathExists(targetDirectoryPath))) {
      Logger.debug(`Target directory '${targetDirectoryPath}' does not exist. Cloning repository`)
      cd(rootDirectoryPath)

      await $`git clone git@github.com:Stocard/${repositoryName}.git`
    }

    const eksModulePath = `${targetDirectoryPath}/all/eks`

    cd(eksModulePath)

    await this.checkIfInfrastructureIsUpToDate(awsProfileMainAccount)

    Logger.debug(`Updating ${eksModulePath}/eks.hcl file`)

    const eksFile = fs.readFileSync(`${eksModulePath}/eks.hcl`, 'utf8')
      .replace(`= "${Config.expectedK8sVersion}"`, `= "${Config.targetK8sVersion}"`)
      .replace(Config.expectedCurrentAMIRegex, `= "${Config.targetAMI}"`)

    fs.writeFileSync(`${eksModulePath}/eks.hcl`, eksFile)

    const gitDiff = (await $`git diff`).stdout.trim() 

    Logger.info('Here are the git changes:')

    console.log(gitDiff)

    const proceedAfterGit = await question('Should the script continue? [y/n] ', { choices: ['y', 'n'] })

    if (proceedAfterGit !== 'y') {
      Exit.withWarning('Aborting...')
    }

    Logger.debug('terraform planning...')

    const terraformPlan = (await $`AWS_PROFILE=STS_SESSION terragrunt plan 2> >(grep -v "\[terragrunt]" >&2)`).stdout.trim()

    console.log(terraformPlan)

    if (!terraformPlan.includes('Plan:') && !terraformPlan.includes(' 2 to add, 2 to change, 2 to destroy.')) {
//      Exit.withError('❌ Plan shoud be: 2 to add, 2 to change, 2 to destroy.')
    }

    const proceedAfterTerraformPlan = await question('Should terraform apply? [y/n] ', { choices: ['y', 'n'] })
    if (proceedAfterTerraformPlan !== 'y') {
      Exit.withWarning('Aborting...')
    }

    const previousVervoseValue = $.verbose
    $.verbose = true
    await $`AWS_PROFILE=STS_SESSION terragrunt apply -auto-approve 2> >(grep -v "\[terragrunt]" >&2)`
    $.verbose = previousVervoseValue

    cd(currentDir)
  }

  private static async checkIfInfrastructureIsUpToDate(awsProfile: string) {
    try {
      Logger.debug('☐ Checking if Infrastructure is up-to-date')
      const terragruntPlan = (await $`AWS_PROFILE=${awsProfile} terragrunt plan`).stdout.trim()
  
      if (!terragruntPlan.includes('No changes. Infrastructure is up-to-date.')) {
        console.log(terragruntPlan)
        Exit.withError('❌ Infrastructure is not up-to-date')
      }
  
      Logger.debug('☑ Infrastructure is up-to-date')
    } catch (error) {
      Exit.withError('Error when running `terragrunt plan` in order to check if Infrastructure is up-to-date')
    }
  }
}

export { Terragrunt }
