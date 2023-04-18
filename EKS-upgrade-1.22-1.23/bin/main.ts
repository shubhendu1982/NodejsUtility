#! ./node_modules/.bin/ts-node

import { $, argv } from 'zx'
import { isEmpty, isNil } from 'lodash'
import { Logger } from './logger'
import { Utils } from './utils'
import { Config } from './config'
import { Kubectl } from './kubectl'
import { AwsCli } from './aws-cli'
import { Terragrunt } from './terragrunt'
import { K8sPluginUpdater } from './k8s-plugin-updater'
import { K8sNodeManager } from './k8s-node-manager'
import { Assessor } from './assessor'
import { AwsSTSCredential } from './aws-sts-credential.interfaces'
import { Exit } from './exit'

$.verbose = false
const awsEndoAccountNo = "762563971297"
const awsMainAccountNo = "065432680525"

async function runAll(
  endo: string,
  clusterContext: string,
  awsProfileMainAccount: string,
  awsProfileTargetEndo: string
): Promise<void> {
  await Kubectl.useContext(clusterContext, awsProfileTargetEndo)

  await AwsCli.checkIfAwsProfileIsValid(awsProfileMainAccount)

  if (!argv['skip-pre-assessment']) {
    await Assessor.preAssessment(clusterContext)
  }

  if (!argv['skip-terraform-changes']) {
    await Terragrunt.upgrade(endo, awsProfileMainAccount)
  }

  await AwsCli.checkIfAwsProfileIsValid(awsProfileTargetEndo)

  if (!argv['skip-nodes-upgrade']) {
    await K8sNodeManager.upgrade(endo, awsProfileTargetEndo, clusterContext)
  }

  if (!argv['skip-plugins-update']) {
    await K8sPluginUpdater.updatePlugins(clusterContext)
  }

  if (!argv['skip-post-assessment']) {
    await Assessor.postAssessment(clusterContext)
  }

  Logger.info('🎉  End')
}

async function main() {
  if (!isNil(argv['verbose'])) {
    $.verbose = true
  }

  await Utils.checkRequiredProgramsExist(['kubectl', 'jq', 'git', 'terragrunt', 'terraform', 'aws', 'gh'])

  const env = await Utils.getEnv('env', Config.allowedEnvironments, true)
  const domain = await Utils.getEnv('domain', Config.allowedDomain)
  const endo = `${env}-${domain}`

  const clusterContext = `eks@${endo}`
  const awsProfileMainAccount = "aws-manager@main"
  const awsProfileTargetEndo = `aws-manager@${endo}`

  if (argv['use-aws-profile'] && argv['use-aws-role']) {
    Exit.withError('☐ Parameters use-aws-profile or use-aws-role both can\'t be used same time')
  }

  if (!argv['use-aws-profile'] && !argv['use-aws-role']) {
    Exit.withError('☐ Provide use-aws-profile or use-aws-role as parameter option')
  }

  if (argv['use-aws-role']) {
    const awsSTSCredentialPlatformManagerTargetEndo: AwsSTSCredential = await AwsCli.getAssumeRoleAWSCredentials
      (`arn:aws:iam::${awsEndoAccountNo}:role/managed/cloud-automation/cloud-automation.platform-manager`)
    await AwsCli.createAWSProfile(`platform-manager@${endo}`, awsSTSCredentialPlatformManagerTargetEndo)

    const awsSTSCredentialAwsManagerProfileTargetEndo: AwsSTSCredential = await AwsCli.getAssumeRoleAWSCredentials
      (`arn:aws:iam::${awsEndoAccountNo}:role/managed/cloud-automation/cloud-automation.aws-manager`)
    await AwsCli.createAWSProfile(`${awsProfileTargetEndo}`, awsSTSCredentialAwsManagerProfileTargetEndo)

    const awsSTSCredentialAwsProfileMainAccount: AwsSTSCredential = await AwsCli.getAssumeRoleAWSCredentials
      (`arn:aws:iam::${awsMainAccountNo}:role/managed/cloud-automation/cloud-automation.aws-manager`)
    await AwsCli.createAWSProfile(`${awsProfileMainAccount}`, awsSTSCredentialAwsProfileMainAccount)
  }

  await $`AWS_PROFILE=platform-manager@${endo} aws eks update-kubeconfig --name eks_cluster --region eu-west-1 --alias ${clusterContext}`

  //await runAll(endo, clusterContext, awsProfileMainAccount, awsProfileTargetEndo)
}

void (main)()
