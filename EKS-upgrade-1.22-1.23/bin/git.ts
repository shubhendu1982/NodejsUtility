import { $, cd } from 'zx'
import { Config } from './config'
import { Logger } from './logger'
import { Utils } from './utils'

class Git {
  static async openPr(targetDirectoryPath: string) {
    const currentDir = (await $`pwd`).stdout.trim()

    await Utils.checkRequiredProgramsExist(['git', 'gh'])

    cd(targetDirectoryPath)

    const k8sVersion = `v${Config.targetK8sVersion}`
    const newBranchName = `eks-upgrade-${k8sVersion}`
    const commitMsg = `🤖 Upgrade EKS cluster to ${k8sVersion}`

    await $`git checkout -b ${newBranchName}`
    await $`git add .`
    await $`git commit -m "${commitMsg}"`

    Logger.debug('Pushing change')

    await $`git push --set-upstream origin ${newBranchName}`

    const description = `Terraform applied. Related to ${Config.issueReference}`
    const response = (await $`gh pr create --title ${commitMsg} --assignee "@me" --body ${description} --reviewer Stocard/team-stocard-backend-and-devops-core`).stdout.trim()

    Logger.info(`PR Opened: ${response}`)

    cd(currentDir)
  }
}

export { Git }
