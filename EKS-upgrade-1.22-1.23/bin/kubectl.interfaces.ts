interface KubectlGetVersion {
  serverVersion: {
    major: string
    minor: string
  }
}

interface K8sNodeStatusCondition {
  status: string
  type: string
}

interface K8sNode {
  metadata: {
    name: string
  }
  status: {
    nodeInfo: {
      kubeletVersion: string
    }
    conditions: K8sNodeStatusCondition[]
  }
  spec: {
    providerID: string
  }
}

interface KubectlGetNodes {
  items: K8sNode[]
}

interface KubectlGetPspEksPrivileged {
  metadata: {
    name: string
  }
}

export { KubectlGetVersion, K8sNode, KubectlGetNodes, KubectlGetPspEksPrivileged, K8sNodeStatusCondition }