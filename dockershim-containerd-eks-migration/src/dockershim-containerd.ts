#! ./node_modules/.bin/ts-node
// AWS_PROFILE="platform-manager@<ENV>-<DOMAIN>" AWS_DEFAULT_REGION="eu-west-1" ts-node ./src/dockershim-containerd.ts --endo <endo> --env <env>
// i.e. AWS_PROFILE="platform-manager@dev-payment-operations" AWS_DEFAULT_REGION="eu-west-1" ts-node ./src/dockershim-containerd.ts --endo payment-operations --env dev

import { $, argv, cd } from 'zx'
import * as fs from 'fs';
import { isNil } from 'lodash'

async function main() {
   
  const endo = argv['endo']
  const env = argv['env']

  if (isNil(endo) || isNil(env))
  {
    console.log("Please provide all the arguments")
    process.exit(1)
  }
  
  await $`kubectl config use-context eks@${env}-${endo}`
  const autoScalingGroupJson = await $`aws autoscaling describe-auto-scaling-groups --query "AutoScalingGroups[? Tags[? (Key=='Name') && Value=='eks_cluster-worker_group_default-eks_asg']]"`

  const autoScalingGroup = JSON.parse(autoScalingGroupJson.stdout)

  if (autoScalingGroup.Length <= 0) {
    console.log("autoScalingGroup doesn't exists")
    process.exit(1)
  }

  const launchConfigurationName = autoScalingGroup[0].LaunchConfigurationName
  const asgDesiredCapacity = Number(autoScalingGroup[0].DesiredCapacity)
  const asgMaxSize = Number(autoScalingGroup[0].MaxSize)
  const asgnName = autoScalingGroup[0].AutoScalingGroupName

  const launchConfigurationJson = await $`aws autoscaling describe-launch-configurations --launch-configuration-names ${launchConfigurationName}`
  const launchConfiguration = JSON.parse(launchConfigurationJson.stdout)

  if (launchConfiguration.LaunchConfigurations.Length <= 0) {
    console.log("Launch configuration doesn't exists")
    process.exit(1)
  }
  const amiId = launchConfiguration.LaunchConfigurations[0].ImageId
  const instanceType = launchConfiguration.LaunchConfigurations[0].InstanceType
  const iamInstanceProfile = launchConfiguration.LaunchConfigurations[0].IamInstanceProfile
  const securityGroup = launchConfiguration.LaunchConfigurations[0].SecurityGroups[0]

  const userData = Buffer.from(launchConfiguration.LaunchConfigurations[0].UserData, 'base64').toString('utf8')
  const userDataArray = userData.trimEnd().split("\n")

  const userDataNewArray = []

  for (let userDataLine of userDataArray) {
    if (userDataLine.startsWith('/etc/eks/bootstrap.sh')) {
      userDataLine = userDataLine.replace('--kubelet-extra-args "" \'eks_cluster\'', '--container-runtime containerd --kubelet-extra-args "" \'eks_cluster\'')
    }
    userDataNewArray.push(userDataLine)
  }

  const userDataWithContainerd = userDataNewArray.join("\n")

  fs.writeFile('./userdata.txt', userDataWithContainerd, err => {
    if (err) {
      console.error(err);
      process.exit(1)
    }
    // file written successfully
  });

  await $`aws autoscaling create-launch-configuration --launch-configuration-name ${launchConfigurationName}_containerd --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":100,"VolumeType":"gp2","DeleteOnTermination": true}}]' --image-id ${amiId}  --instance-type ${instanceType} --iam-instance-profile ${iamInstanceProfile} --security-groups ${securityGroup} --user-data file://userdata.txt`
  await $`aws autoscaling update-auto-scaling-group --auto-scaling-group-name ${asgnName} --launch-configuration-name ${launchConfigurationName}_containerd`

  const nodes = await $`kubectl get nodes --template \'{{range .items}}{{.metadata.name}}{{"\\n"}}{{end}}\'`
  const nodesArray = nodes.stdout.trimEnd().split("\n")

  await $`aws autoscaling update-auto-scaling-group --auto-scaling-group-name ${asgnName} --max-size ${asgMaxSize * 2} --desired-capacity ${asgDesiredCapacity * 2}`

  while (true) {
    const asgDetaislJson = await $`aws autoscaling describe-auto-scaling-groups --auto-scaling-group-name ${asgnName}`
    const asgDetais = JSON.parse(asgDetaislJson.stdout)
    const desiredCapasity = Number(asgDetais.AutoScalingGroups[0].DesiredCapacity)
    const numOfInstances = Number(asgDetais.AutoScalingGroups[0].Instances.length)

    if (desiredCapasity == numOfInstances) {
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 30000));
    console.log("Waiting for nodes to be ready")
  }

  await $`kubectl wait --for=condition=Ready nodes --all --timeout=600s`

  for (let node of nodesArray) {
    await $`kubectl cordon ${node}`
    await $`kubectl drain ${node} --ignore-daemonsets --delete-emptydir-data`

    await $`kubectl wait deployment --all --for condition=Available=True --timeout=1800s --all-namespaces`
  }
  await $`aws autoscaling update-auto-scaling-group --auto-scaling-group-name ${asgnName} --max-size ${asgMaxSize} --desired-capacity ${asgDesiredCapacity}`

  console.log("Waiting for pods to be ready")
  await $`kubectl wait deployment --all --for condition=Available=True --timeout=1800s --all-namespaces`

  console.log("Operation completed successfully")
}


main()
