class Config {
  static allowedEnvironments = ['dev', 'staging', 'prod', 'sandbox']
  static allowedDomain = ['payment', 'general', 'core', 'content', 'retail', 'payment-operations', 'pramos']
  static expectedMajorVersion = '1'
  static expectedMinorVersion = '22'
  static targetMinorVersion = '23'
  static expectedCurrentAMIRegex = /= "amazon-eks-node-1\.22.*"/gm
  static targetAMI = 'amazon-eks-node-1.23-v20230304'
  static expectedASGName = 'eks_cluster-worker_group_default-eks_asg'
  static issueReference = 'https://klarna.atlassian.net/browse/SBDC-189'
  static expectedK8sVersion = `${this.expectedMajorVersion}.${this.expectedMinorVersion}`
  static targetK8sVersion = `${this.expectedMajorVersion}.${this.targetMinorVersion}`
  static awsK8sCniFilePath = (version: string): string => `./addons/vpc-cni/${version}/aws-k8s-cni.yaml`
  static expected = {
    awsK8sCni: {
      containerImage: '602401143452.dkr.ecr.us-west-2.amazonaws.com/amazon-k8s-cni:v1.12.5',
      initContainerImage: '602401143452.dkr.ecr.us-west-2.amazonaws.com/amazon-k8s-cni-init:v1.12.5'
    }
  }
  static targetCoreDnsImage = '602401143452.dkr.ecr.eu-west-1.amazonaws.com/eks/coredns:v1.8.7-eksbuild.4'
  static targetKubeProxyImage = '602401143452.dkr.ecr.eu-west-1.amazonaws.com/eks/kube-proxy:v1.23.16-eksbuild.2'
}

export { Config }
