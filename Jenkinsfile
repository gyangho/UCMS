// 2026-08-21: Run credential-free PR checks on the isolated UCMS CI agent and DinD daemon.
pipeline {
  agent { label 'ucms-ci && docker && linux' }

  options {
    buildDiscarder(logRotator(numToKeepStr: '20'))
    disableConcurrentBuilds()
    skipDefaultCheckout(true)
    timeout(time: 60, unit: 'MINUTES')
    timestamps()
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
        sh 'git rev-parse --verify HEAD'
      }
    }

    stage('Sensitive file guard') {
      steps {
        sh '.jenkins/ci/run-stage.sh guard'
      }
    }

    stage('React lint and build') {
      steps {
        sh '.jenkins/ci/run-stage.sh react'
      }
    }

    stage('Node dependency and syntax checks') {
      steps {
        sh '.jenkins/ci/run-stage.sh node'
      }
    }

    stage('Spring and Flyway integration') {
      steps {
        sh '.jenkins/ci/run-stage.sh spring'
      }
    }

    stage('Production image builds') {
      steps {
        sh '.jenkins/ci/run-stage.sh images'
      }
    }
  }

  post {
    always {
      sh(returnStatus: true, script: '.jenkins/ci/run-stage.sh cleanup')
      deleteDir()
    }
  }
}
