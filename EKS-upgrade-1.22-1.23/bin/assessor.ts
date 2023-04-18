import { Config } from './config'
import { K8sPluginUpdater } from './k8s-plugin-updater'
import { Kubectl } from './kubectl'
import { Logger } from './logger'

class Assessor {
  static async preAssessment(clusterContext: string): Promise<void> {
    Logger.info('☐ Running Pre-assessment')
    await Kubectl.useContext(clusterContext)
    await Kubectl.checkK8sVersion(Config.expectedMajorVersion, Config.expectedMinorVersion)
    const expectedVersion = `v${Config.expectedK8sVersion}.`
    await Kubectl.checkNodeVersions(expectedVersion)
    await Kubectl.checkEksPrivilegedPolicy()
    Logger.info('☑ Pre-assessment')
  }

  static async postAssessment(clusterContext: string): Promise<void> {
    Logger.info('☐ Running Post-assessment')
    await Kubectl.useContext(clusterContext)
    await Kubectl.checkK8sVersion(Config.expectedMajorVersion, Config.targetMinorVersion)
    const expectedVersion = `v${Config.targetK8sVersion}.`
    await Kubectl.checkNodeVersions(expectedVersion)
    await Kubectl.checkEksPrivilegedPolicy()
    await K8sPluginUpdater.checkPluginAwsK8Cni()
    await K8sPluginUpdater.checkPluginCoreDns()
    await K8sPluginUpdater.checkPluginKubeProxy()
    Logger.info('☑ Post-assessment')
  }
}

export { Assessor }
