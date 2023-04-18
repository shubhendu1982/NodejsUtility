import { $ } from 'zx'
import { AutoScalingGroup } from './autoscaling.interfaces'
import { Config } from './config'
import { Exit } from './exit'
import { Logger } from './logger'
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { AwsSTSCredential } from './aws-sts-credential.interfaces'

class AwsCli {
  static async checkIfAwsProfileIsValid(awsProfile: string): Promise<void> {
    Logger.debug(`☐ Checking if aws profile "${awsProfile}" is a valid one`)

    await $`AWS_PROFILE=${awsProfile} aws sts get-caller-identity`

    Logger.debug(`☑ aws profile "${awsProfile}" is valid`)
  }

  static async addEksContext(awsProfile: string, context: string): Promise<void> {
    Logger.debug(`☐ Adding EKS context "${context}" with profile "${awsProfile}"`)

    await $`aws eks --region eu-west-1 update-kubeconfig --name eks_cluster --alias ${context} --profile ${awsProfile}`

    Logger.debug(`☑ EKS context "${context}" with profile "${awsProfile}" added`)
  }

  static async createAWSProfile(profileName: string, awsSTSCredential: AwsSTSCredential): Promise<void> {
    Logger.debug(`☐ Creating AWS Profile "${profileName}"`)

    await $`aws configure set default.region eu-west-1`
    await $`aws configure set region eu-west-1 --profile ${profileName}`
    await $`aws configure set aws_access_key_id ${awsSTSCredential.AccessKeyId} --profile ${profileName}`
    await $`aws configure set aws_secret_access_key ${awsSTSCredential.SecretAccessKey} --profile ${profileName}`
    await $`aws configure set aws_session_token ${awsSTSCredential.SessionToken} --profile ${profileName}`

    Logger.debug(`☐ Created AWS Profile "${profileName}"`)
  }

  static async getAssumeRoleAWSCredentials(roleArn: string): Promise<AwsSTSCredential> {
    Logger.debug(`☐ Retrieving sts credentials for AWS role ${roleArn}`)

    let roleToAssume = {
      RoleArn: `${roleArn}`,
      RoleSessionName: 'AWSCLI-Session',
      DurationSeconds: 3600,
    };

    // a client can be shared by different aws commands.
    const client = new STSClient({ region: "eu-west-1" });

    // Create the STS service object    
    const command = new AssumeRoleCommand(roleToAssume)
    const data = await client.send(command);

    // Set AWS environment variable
    if (data.Credentials != null) {
      Logger.debug(`☐ Retrieved sts credentials for AWS role ${roleArn}`)

      return {
        AccessKeyId: data.Credentials.AccessKeyId, SecretAccessKey: data.Credentials.SecretAccessKey
        , SessionToken: data.Credentials.SessionToken
      }
    }
    Exit.withError(`Not able retrieve sts credentials for AWS role ${roleArn}`)
  }


  static async getStableAutoScalingGroup(awsProfile: string): Promise<AutoScalingGroup> {
    const autoScalingGroupsDescription: AutoScalingGroup[] = JSON.parse((await $`AWS_PROFILE=${awsProfile} aws autoscaling describe-auto-scaling-groups --query 'AutoScalingGroups[?contains(Tags[?Key==\`Name\`].Value, \`${Config.expectedASGName}\`)]' --region eu-west-1 --output json`).stdout.trim())

    if (autoScalingGroupsDescription.length !== 1) {
      Exit.withError('Should have exactly 1 autoscaling group')
    }

    const autoScalingGroup = autoScalingGroupsDescription[0]

    if (autoScalingGroup.Instances.length !== autoScalingGroup.DesiredCapacity) {
      throw new Error(`Number of instances (${autoScalingGroup.Instances.length}) is not the desired capacity (${autoScalingGroup.DesiredCapacity})`)
    }

    return autoScalingGroup
  }
}

export { AwsCli }
