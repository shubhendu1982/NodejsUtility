import { isNil } from 'lodash'
import { $, question } from 'zx'
import { AwsCli } from './aws-cli'
import { Exit } from './exit'
import { K8sNode, KubectlGetNodes, KubectlGetPspEksPrivileged, KubectlGetVersion } from './kubectl.interfaces'
import { Logger } from './logger'

class Kubectl {
  static async useContext(context: string, awsProfile?: string): Promise<void> {
    const hasContext = (await $`kubectl config get-contexts | { grep ${context} || true; }`).stdout.trim().includes(context)

    if (!hasContext && !awsProfile) {
      Exit.withError(`Context ${context} not detected. AWS Profile needs to be provided`)
    }

    if (!hasContext) {
      Logger.debug(`Context ${context} not detected. Adding.`)
      await AwsCli.addEksContext(awsProfile, context)
    }

    Logger.debug(`Using k8s context: ${context}`)

    const response = (await $`kubectl config use-context ${context}`).stdout.trim()
  
    if (response !== `Switched to context "${context}".`) {
      Exit.withError('Context was not switched')
    }
  
    Logger.debug(`Switched to context "${context}".`)
  }

  static async checkK8sVersion(major: string, minor: string): Promise<void> {
    Logger.debug('☐ Checking k8s version')
  
    const response: KubectlGetVersion = JSON.parse((await $`kubectl version -o json`).stdout)
  
    if (response.serverVersion.major !== major) {
      Exit.withError(`Major version (${response.serverVersion.major}) is not the expected one (${major})`)
    }
  
    const expectedMinorVersionPlus = `${minor}+`
  
    if (response.serverVersion.minor !== expectedMinorVersionPlus) {
      Exit.withError(`Minor version (${response.serverVersion.minor}) is not the expected one (${expectedMinorVersionPlus})`)
    }
  
    Logger.debug('☑ K8s version checked')
  }
  
  static async checkNodeVersions(expectedVersion: string): Promise<void> {
    Logger.debug('☐ Checking k8s node versions')
  
    const nodeInfos = (await this.getNodes()).map(node => node.status.nodeInfo)
  
    for (const nodeInfo of nodeInfos) {
      if (!nodeInfo.kubeletVersion.startsWith(expectedVersion)) {
        Exit.withError(`kubeletVersion ${nodeInfo.kubeletVersion} of node doesn't start with expected version ${expectedVersion}`)
      }
    }
  
    Logger.debug('☑ K8s node versions checked')
  }
  
  static async checkEksPrivilegedPolicy(): Promise<void> {
    Logger.debug('☐ Checking eks privileged policy')
  
    const response: KubectlGetPspEksPrivileged = JSON.parse((await $`kubectl get psp eks.privileged -o json`).stdout)
    
    if (isNil(response) || isNil(response.metadata) ||  !response.metadata.hasOwnProperty('name')) {
      Exit.withError('No eks privileged policy detected')
    }
  
    Logger.debug('☑ eks privileged policy checked')
  }

  static async checkPodsAreRunning(clusterContext?: string): Promise<void> {
    Logger.debug('☐ Checking All pods are running')
    if (clusterContext) {
      await this.useContext(clusterContext)
    }

    const response = (await $`kubectl get pods --field-selector=status.phase!=Running --all-namespaces`)

    if (response.stderr.trim() === 'No resources found') {
      Logger.debug('☑ All pods are running')
      return
    }

    console.log(response.stdout)

    const answer = await question('There are pods that are not running. Use the command `kubectl get pods --field-selector=status.phase!=Running --all-namespaces` to check them. Should we proceed [p], abort [a], or enter to check again? ', { choices: ['p', 'a', 'c'] })

    switch (answer) {
      case 'a':
        Exit.withWarning('Aborting...')
        break
      
      case 'p':
        Logger.debug('Proceeding...')
        break
    
      default:
        await this.checkPodsAreRunning(clusterContext)
        break
    }
  }

  static async applyFile(clusterContext: string, filePath: string): Promise<void> {
    await this.useContext(clusterContext)

    await $`kubectl apply -f ${filePath}`
  }

  static async getNodes(props?: { context?: string, version?: string}): Promise<K8sNode[]> {
    Logger.debug('Getting k8s nodes')
  
    if (props && props.context) {
      await Kubectl.useContext(props.context)
    }
  
    const response: KubectlGetNodes = JSON.parse((await $`kubectl get nodes -o json`).stdout)
    
    if (props && props.version) {
      return response.items.filter(node => node.status.nodeInfo.kubeletVersion.startsWith(props.version))
    }
  
    return response.items
  }
}

export { Kubectl }
