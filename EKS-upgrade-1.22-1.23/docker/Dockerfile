FROM stocard/node:14
RUN npm i -g zx

COPY ./package.json ./package.json
COPY ./package-lock.json ./package-lock.json
RUN npm i

RUN apk add --no-cache \
        python3 \
        py3-pip \
        wget \
        curl \
        jq \
        github-cli \
        git \
        openssh-client \
    && pip3 install --upgrade pip \
    && pip3 install --no-cache-dir \
        awscli \
    && rm -rf /var/cache/apk/*

RUN wget https://releases.hashicorp.com/terraform/0.12.31/terraform_0.12.31_linux_amd64.zip
RUN unzip terraform_0.12.31_linux_amd64.zip && rm terraform_0.12.31_linux_amd64.zip
RUN mv terraform /usr/bin/terraform

RUN wget https://github.com/gruntwork-io/terragrunt/releases/download/v0.27.0/terragrunt_linux_amd64
RUN chmod +x ./terragrunt_linux_amd64
RUN mv ./terragrunt_linux_amd64 /usr/local/bin/terragrunt

RUN wget https://storage.googleapis.com/kubernetes-release/release/v1.23.5/bin/linux/amd64/kubectl
RUN chmod +x ./kubectl
RUN mv ./kubectl /usr/local/bin/kubectl

COPY ./tsconfig.json ./tsconfig.json
COPY ./bin ./bin
COPY ./addons ./addons
COPY ./.kube ./.kube

COPY ./docker/echo_pass.sh ./echo_pass.sh
RUN chmod +x ./echo_pass.sh

COPY ./docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

ENTRYPOINT ["/root/entrypoint.sh"]
