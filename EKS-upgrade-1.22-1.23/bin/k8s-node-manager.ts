import { $, question } from 'zx'
import { AutoScalingGroup } from './autoscaling.interfaces'
import { AwsCli } from './aws-cli'
import { Config } from './config'
import { Exit } from './exit'
import { ClusterAutoscaler } from './k8s-node-manager.interfaces'
import { Kubectl } from './kubectl'
import { K8sNode } from './kubectl.interfaces'
import { Logger } from './logger'
import { Utils } from './utils'

class K8sNodeManager {
  static async upgrade(endo: string, awsProfile: string, clusterContext: string): Promise<void> {
    await Kubectl.checkK8sVersion(Config.expectedMajorVersion, Config.targetMinorVersion)
  
    const expectedVersion = `v${Config.expectedK8sVersion}.`
    const { originalMaxSize, autoScalingGroupName } = await this.prepareNodesForUpgrade(endo, awsProfile, clusterContext)
    const oldNodes = await Kubectl.getNodes({ version: expectedVersion })
  
    await Utils.checkFunction(async () => { return await this.taintNodes(oldNodes) })
    await Utils.checkFunction(async () => { return await this.drainNodes(oldNodes) })
    await Kubectl.checkPodsAreRunning(clusterContext)
    await Utils.checkFunction(async () => { return await this.terminateOldNodes(awsProfile, oldNodes) })
    await this.checkThereAreNoPreviousVersionRunning(expectedVersion, clusterContext)
    await $`AWS_PROFILE=${awsProfile} aws autoscaling  update-auto-scaling-group --auto-scaling-group-name ${autoScalingGroupName} --max-size ${originalMaxSize} --region eu-west-1`
    await $`kubectl scale deployments/aws-cluster-autoscaler --replicas=1 -n kube-system`
  
    Logger.info('✅ Nodes upgraded')
  }

  private static async prepareNodesForUpgrade(endo: string, awsProfile: string, clusterContext: string): Promise<{ originalMaxSize: string, autoScalingGroupName: string }> {
    const clusterAutoscaler: ClusterAutoscaler = JSON.parse((await $`kubectl get deployments/aws-cluster-autoscaler -n kube-system -o json`).stdout)
    const autoScalingGroup: AutoScalingGroup = await Utils.checkFunction(async () => { return await AwsCli.getStableAutoScalingGroup(awsProfile) })

    Logger.info(`[Current cluster configurtation] | MaxSize: ${autoScalingGroup.MaxSize} | DesiredCapacity: ${autoScalingGroup.DesiredCapacity}`)

    if (!clusterAutoscaler.status.replicas || clusterAutoscaler.status.replicas === 0) {
      Logger.info('Autoscaler already disabled')

      const originalMaxSize = (await $ `curl -s https://$GH_TOKEN@raw.githubusercontent.com/Stocard/endo-${endo}/master/all/eks/eks.hcl | grep asg_max_size | grep -o '".*"' | sed 's/"//g'`).stdout.trim()

      return { originalMaxSize, autoScalingGroupName: autoScalingGroup.AutoScalingGroupName }
    }

    await $`kubectl scale deployments/aws-cluster-autoscaler --replicas=0 -n kube-system`
  
    if (await question('Proceed changing desired and max capacity of the cluster? [y/n] ', { choices: ['y', 'n'] }) !== 'y') {
      Exit.withWarning('Aborting...')
    }
  
    const originalDesiredCapacity = autoScalingGroup.DesiredCapacity
    const originalMaxSize = autoScalingGroup.MaxSize
    const desiredCapacity = originalDesiredCapacity * 3
    const diff = desiredCapacity - originalMaxSize
    const maxSize = diff > 0
      ? originalMaxSize + diff
      : originalMaxSize

    Logger.debug(`diff: ${diff} | originalMaxSize: ${originalMaxSize}`)
  
    await this.scaleCluster(
      awsProfile,
      autoScalingGroup.AutoScalingGroupName,
      desiredCapacity,
      clusterContext,
      diff > 0
        ? maxSize
        : undefined
    )

    return { originalMaxSize: originalMaxSize.toString(), autoScalingGroupName: autoScalingGroup.AutoScalingGroupName }
  }
  
  private static async taintNodes(nodes: K8sNode[]): Promise<void> {
    const previousVervoseValue = $.verbose
  
    for (const node of nodes) {
      const nodeName = node.metadata.name
      Logger.debug(`Tainting node ${nodeName}`)
  
      $.verbose = true
      await $`kubectl taint nodes ${nodeName} key=value:NoSchedule --overwrite`
      $.verbose = previousVervoseValue
    }
  }
  
  private static async terminateOldNodes(awsProfile: string, nodes: K8sNode[]): Promise<void> {
    Logger.info('Terminating old nodes')
  
    const providerIds = nodes.map(node => node.spec.providerID)
    const instanceIds = providerIds.map(providerId => {
      const id = providerId.split('/i-')
      return `i-${id[1]}`
    })
  
    for (const instanceId of instanceIds) {
      Logger.debug(`⏳ Terminating instance with instanceId ${instanceId}`)
      await Utils.checkFunction(async () => {
          return await $`AWS_PROFILE=${awsProfile} aws autoscaling terminate-instance-in-auto-scaling-group --instance-id ${instanceId} --should-decrement-desired-capacity --region eu-west-1`
        },
        (exception, _depth) => {
          // Should continue to retry if error is not "node not found" which means "not was already terminated and can't be found"
          return !exception.message.includes('Error from server (NotFound): nodes ')
        }
      )
      Logger.debug(`✅ Instance with instanceId ${instanceId} terminated`)
    }
  }

  private static async drainNodes(nodes: K8sNode[]): Promise<void> {
    Logger.info('💤 We sleep after each node drain to give some time for the evicted pods to get into running state. This can be skipped by pressing enter.')
  
    for (const node of nodes) {
      const nodeName = node.metadata.name
      Logger.debug(`Draining node ${nodeName}`)
  
      await Utils.checkFunction(async () => {
        const previousVervoseValue = $.verbose
        $.verbose = true
        await $`kubectl drain ${nodeName} --ignore-daemonsets --delete-emptydir-data`
        $.verbose = previousVervoseValue
        return
      })
      
      await Kubectl.checkPodsAreRunning()
    }
  }
  
  private static async scaleCluster(
    awsProfile: string,
    autoScalingGroupName: string,
    desiredCapacity: number,
    clusterContext: string,
    maxSize?: number
  ): Promise<void> {
    const previousVervoseValue = $.verbose
  
    $.verbose = true
    if (maxSize) {
      await $`AWS_PROFILE=${awsProfile} aws autoscaling  update-auto-scaling-group --auto-scaling-group-name ${autoScalingGroupName} --max-size ${maxSize} --region eu-west-1`
    }
  
    await $`AWS_PROFILE=${awsProfile} aws autoscaling set-desired-capacity --auto-scaling-group-name ${autoScalingGroupName} --desired-capacity ${desiredCapacity} --region eu-west-1`
  
    $.verbose = previousVervoseValue
  
    Logger.info('⏳ Waiting cluster reach desired number of instances')
  
    await Utils.checkFunction(async () => { return await AwsCli.getStableAutoScalingGroup(awsProfile) })
    await Utils.checkFunction(async () => { return await this.checkNumberOfK8sNodesMatchDesiredCapacity(awsProfile) })
    await Utils.checkFunction(async () => { return await this.checkNodesAreReady(clusterContext) })
  }

  private static async checkNumberOfK8sNodesMatchDesiredCapacity(awsProfile: string, context?: string): Promise<void> {
    if (context) {
      await Kubectl.useContext(context, awsProfile)
    }

    const autoScalingGroup = await AwsCli.getStableAutoScalingGroup(awsProfile)
    const nodes = await Kubectl.getNodes({ context })

    if (autoScalingGroup.DesiredCapacity !== nodes.length) {
      throw new Error(`Number of nodes (${nodes.length}) does not match the ASG desired capacity (${autoScalingGroup.DesiredCapacity})`)
    }

    Logger.debug('☑ ASG.DesiredCapacity === nodes.length')
  }

  private static async checkNodesAreReady(context?: string): Promise<void> {
    if (context) {
      await Kubectl.useContext(context)
    }

    const nodes = await Kubectl.getNodes()
    const readyConditions = nodes
      .map(node => node.status.conditions.find(condition => condition.type === 'Ready'))
      .filter(condition => {
        if (condition) {
          return condition.status === 'True'
        }

        return false
      })

    if (nodes.length !== readyConditions.length) {
      throw new Error(`Number of nodes (${nodes.length}) does not match the number of READY status (${readyConditions.length})`)
    }

    Logger.debug('☑ All nodes are ready')
  }

  private static async checkThereAreNoPreviousVersionRunning(previousVersion: string, clusterContext?: string): Promise<void> {
    Logger.debug(`☐ Checking if there are nodes with version ${previousVersion} running`)
    if (clusterContext) {
      await Kubectl.useContext(clusterContext)
    }

    const remainingOldNodes = await Kubectl.getNodes({ version: previousVersion })

    if (remainingOldNodes.length === 0) {
      Logger.debug(`☑ No nodes with version ${previousVersion} running`)
      return
    }
  
    Logger.warn(`There are ${remainingOldNodes.length} nodes with version ${previousVersion} still running`)

    const answer = await question('Should we proceed [p], abort [a], or enter to check again? ', { choices: ['p', 'a', 'c'] })
  
    switch (answer) {
      case 'a':
        Exit.withWarning('Aborting...')
        break
      
      case 'p':
        Logger.debug('Proceeding...')
        break
    
      default:
        await this.checkThereAreNoPreviousVersionRunning(previousVersion, clusterContext)
        break
    }
  }
}

export { K8sNodeManager }
