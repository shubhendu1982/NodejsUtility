interface AutoScalingGroup {
  AutoScalingGroupName: string
  MinSize: number
  MaxSize: number
  DesiredCapacity: number
  Instances: {}[]
}

export { AutoScalingGroup }
