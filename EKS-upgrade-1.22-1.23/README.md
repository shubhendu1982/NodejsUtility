## Running

Macos users should add `IgnoreUnknown UseKeychain` on the top of `.ssh/config` file.

GH_TOKEN needs to have the workflow, read:package, admin read:org, read:discussion. You need to authorize the SSO after creating the token.
SSH_PASS is the pharafrase and if you don't have it, it can be a empty value.

```bash
export SSH_PASS=<<YOUR_SSH_KEY_PASSWORD>>
export GH_TOKEN=<<YOUR_GH_TOKEN>>
bash docker/run.sh
ENV=<<ENV>> DOMAIN=<<DOMAIN>> ./bin/main.ts
```

## Skip parameters

- `--skip-pre-assessment`: skips k8s cluster and nodes version verification, as well as EKS privileged policy check
- `--skip-terraform-changes`: skips terraform apply and PR creation
- `--skip-nodes-upgrade`: skips the replacement of existing instances with upgraded nodes by tainting, draining, and terminating
- `--skip-plugins-update`: skips the changes related to add-ons
- `--skip-post-assessment`: skips post assessment

Below is an example of applying all `skip` flags:

```bash
➜ ENV=dev DOMAIN=general ./bin/main.ts --skip-pre-assessment --skip-terraform-changes --skip-nodes-upgrade --skip-plugins-update --skip-post-assessment
[2022-05-27T07:26:05.719Z]  aws-profile-main-account not set. Using default STS_SESSION
[2022-05-27T07:26:05.731Z]  aws-profile-target-endo not set. Using default admin@dev-general
[2022-05-27T07:26:05.947Z]  Context eks@dev-general not detected. Adding.
[2022-05-27T07:26:05.947Z]  ☐ Adding EKS context "eks@dev-general" with profile "admin@dev-general"
[2022-05-27T07:26:07.164Z]  ☑ EKS context "eks@dev-general" with profile "admin@dev-general" added
[2022-05-27T07:26:07.164Z]  Using k8s context: eks@dev-general
[2022-05-27T07:26:07.226Z]  Switched to context "eks@dev-general".
[2022-05-27T07:26:07.228Z]  ☐ Checking if aws profile "STS_SESSION" is a valid one
[2022-05-27T07:26:08.730Z]  ☑ aws profile "STS_SESSION" is valid
[2022-05-27T07:26:08.730Z]  ☐ Running Pre-assessment
[2022-05-27T07:26:08.799Z]  Using k8s context: eks@dev-general
[2022-05-27T07:26:08.861Z]  Switched to context "eks@dev-general".
[2022-05-27T07:26:08.862Z]  ☐ Checking k8s version
[2022-05-27T07:26:10.067Z]  ☑ K8s version checked
[2022-05-27T07:26:10.068Z]  ☐ Checking k8s node versions
[2022-05-27T07:26:10.069Z]  Getting k8s nodes
[2022-05-27T07:26:11.510Z]  ☑ K8s node versions checked
[2022-05-27T07:26:11.511Z]  ☐ Checking eks privileged policy
[2022-05-27T07:26:12.430Z]  ☑ eks privileged policy checked
[2022-05-27T07:26:12.430Z]  ☑ Pre-assessment
[2022-05-27T07:26:12.431Z]  ☐ Checking if aws profile "admin@dev-general" is a valid one
[2022-05-27T07:26:13.546Z]  ☑ aws profile "admin@dev-general" is valid
[2022-05-27T07:26:13.547Z]  🎉  End
```

## CLI

### Useful commands

- `kubectl get nodes`
- `kubectl get pods --field-selector=status.phase!=Running --all-namespaces`
- `aws autoscaling set-desired-capacity --auto-scaling-group-name $ASG_NAME  --region eu-west-1 --desired-capacity $DESIRED_CAPACITY --profile $ENDO_PROFILE`

#### Tainting nodes

```bash
kubectl taint nodes $NODE key=value:NoSchedule
```

Example:

```bash
kubectl taint nodes ip-10-116-129-194.eu-west-1.compute.internal key=value:NoSchedule
```

#### Draining nodes

```bash
kubectl drain $NODE  --ignore-daemonsets --delete-emptydir-data
```

Example:

```bash
kubectl drain ip-10-116-129-194.eu-west-1.compute.internal  --ignore-daemonsets --delete-emptydir-data
```


#### Terminating nodes

```bash
aws autoscaling terminate-instance-in-auto-scaling-group --instance-id $INSTANCE_ID --should-decrement-desired-capacity --region eu-west-1 --profile $ENDO_PROFILE
```

Example:

```bash
aws autoscaling terminate-instance-in-auto-scaling-group --instance-id i-05f030b7bcc0cb1ad --should-decrement-desired-capacity --region eu-west-1 --profile $ENDO_PROFILE
```

## References

- [AWS EKS Cluster Upgrade (Self-managed) - 1.20 To 1.21](https://rharshad.com/aws-eks-upgrade-1.20-to-1.21/)
- Previous upgrade: https://github.com/Stocard/academy-backend/issues/665

## Notes

- Make the code to auto-detect the next steps that need to be performed, this will avoid the need to use `--skip-<xyz>` flags
