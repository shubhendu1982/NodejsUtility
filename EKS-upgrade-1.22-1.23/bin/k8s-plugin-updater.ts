import { $, question } from 'zx'
import { Config } from './config'
import { Exit } from './exit'
import { Kubectl } from './kubectl'
import { Logger } from './logger'
import { Utils } from './utils'

class K8sPluginUpdater {
  static async updatePlugins(clusterContext: string): Promise<void> {
    await this.updatePluginAwsK8Cni(clusterContext)
    await this.updatePluginCoreDns(clusterContext)
    await this.updatePluginKubeProxy(clusterContext)
  }
  
  static async checkPluginAwsK8Cni(clusterContext?: string): Promise<void> {
    Logger.debug('☐ Checking AWS CNI plugin')

    if (clusterContext) {
      await Kubectl.useContext(clusterContext)
    }

    Logger.debug('  ☐ Checking AWS CNI container image')
  
    const targetImage = Config.expected.awsK8sCni.containerImage
    const containerImage = (await $`kubectl get daemonset aws-node --namespace kube-system -o=jsonpath='{$.spec.template.spec.containers[:1].image}'`).stdout.trim()
  
    if (containerImage !== targetImage) {
      Logger.warn(`❌ AWS CNI container image (${containerImage}) does not correspond to the expected one (${targetImage})`)
  
      if (await question('Should the script continue? [y/n] ', { choices: ['y', 'n'] }) !== 'y') {
        Exit.withWarning('Aborting...')
      }
    } else {
      Logger.debug('  ☑ AWS CNI container image updated')
    }

    Logger.debug('  ☐ Checking AWS CNI init container image')
  
    const initContainerImage = (await $`kubectl get daemonset aws-node --namespace kube-system -o=jsonpath='{$.spec.template.spec.initContainers[:1].image}'`).stdout.trim()
  
    if (initContainerImage !== Config.expected.awsK8sCni.initContainerImage) {
      Logger.warn(`❌ AWS CNI init container image (${initContainerImage}) does not correspond to the expected one (${Config.expected.awsK8sCni.initContainerImage})`)
  
      if (await question('Should the script continue? [y/n] ', { choices: ['y', 'n'] }) !== 'y') {
        Exit.withWarning('Aborting...')
      }
    } else {
      Logger.debug('  ☑ AWS CNI init container image updated')
    }

    Logger.debug('☑ AWS CNI plugin checked')
  }
  
  static async checkPluginCoreDns(clusterContext?: string): Promise<void> {
    Logger.debug('☐ Checking CoreDNS container image')

    if (clusterContext) {
      await Kubectl.useContext(clusterContext)
    }

    const targetImage = Config.targetCoreDnsImage
  
    const containerImage = (await $`kubectl get deployment coredns --namespace kube-system -o=jsonpath='{$.spec.template.spec.containers[:1].image}'`).stdout.trim()
  
    if (containerImage !== targetImage) {
      Logger.warn(`❌ CoreDNS container image (${containerImage}) does not correspond to the expected one (${targetImage})`)
  
      if (await question('Should the script continue? [y/n] ', { choices: ['y', 'n'] }) !== 'y') {
        Exit.withWarning('Aborting...')
      }

      return
    }

    Logger.debug('☑ CoreDNS container image updated')
  }

  static async checkPluginKubeProxy(clusterContext?: string): Promise<void> {
    Logger.debug('☐ Checking Kube-Proxy container image')

    if (clusterContext) {
      await Kubectl.useContext(clusterContext)
    }
    
    const targetImage = Config.targetKubeProxyImage
    const containerImage = (await $`kubectl get daemonset kube-proxy --namespace kube-system -o=jsonpath='{$.spec.template.spec.containers[:1].image}'`).stdout.trim()
  
    if (containerImage !== targetImage) {
      Logger.warn(`❌ Kube-Proxy container image (${containerImage}) does not correspond to the expected one (${targetImage})`)
  
      if (await question('Should the script continue? [y/n] ', { choices: ['y', 'n'] }) !== 'y') {
        Exit.withWarning('Aborting...')
      }

      return
    }

    Logger.debug('☑ Kube-Proxy container image updated')
  }

  private static async updatePluginAwsK8Cni(clusterContext: string): Promise<void> {
    await Kubectl.useContext(clusterContext)

    await Kubectl.applyFile(clusterContext, Config.awsK8sCniFilePath('v1.12.5'))

    await this.checkPluginAwsK8Cni()
  }

  private static async updatePluginCoreDns(clusterContext: string): Promise<void> {
    const targetImage = Config.targetCoreDnsImage

    await Kubectl.useContext(clusterContext)
    await $`kubectl patch clusterrole system:coredns -n kube-system --type='json' -p='[{"op": "add", "path": "/rules/0", "value":{ "apiGroups": ["discovery.k8s.io"], "resources": ["endpointslices"], "verbs": ["list","watch"]}}]'`
    await $`kubectl set image --namespace kube-system deployment.apps/coredns coredns=${targetImage}`
    await this.checkPluginCoreDns()
  }
  
  private static async updatePluginKubeProxy(clusterContext: string): Promise<void> {
    const targetImage = Config.targetKubeProxyImage

    await Kubectl.useContext(clusterContext)
    await $`kubectl set image daemonset.apps/kube-proxy -n kube-system kube-proxy=${targetImage}`
    await this.checkPluginKubeProxy()
  }
}

export { K8sPluginUpdater }
