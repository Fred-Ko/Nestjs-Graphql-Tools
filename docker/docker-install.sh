#!/bin/bash

# Step 1: 우분투 시스템 패키지 업데이트
sudo apt-get update

# Step 2: 필요한 패키지 설치
sudo apt-get install -y apt-transport-https ca-certificates curl gnupg-agent software-properties-common

# Step 3: Docker의 공식 GPG키를 추가
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -

# Step 4: Docker의 공식 apt 저장소를 추가
sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"

# Step 5: 시스템 패키지 업데이트
sudo apt-get update

# Step 6: Docker 설치
sudo apt-get install -y docker-ce docker-ce-cli containerd.io

# Step 7: Docker가 설치 확인
# 7-1 도커 실행상태 확인
# sudo systemctl status docker

# 예: Docker 그룹에 현재 사용자 추가 (권장하지만 보안 주의 필요)
sudo usermod -aG docker $USER

sudo chmod 666 /var/run/docker.sock

# 예: Docker 데몬 재시작
sudo systemctl restart docker

# 추가 작업을 여기에 추가할 수 있습니다.

echo "Docker 설치와 구성이 완료되었습니다."

# 스크립트를 실행한 후에는 로그아웃하고 다시 로그인해야 할 수 있습니다.
echo "로그아웃 후 Docker 그룹 권한이 적용됩니다."