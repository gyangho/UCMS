import jenkins.model.Jenkins

// 2026-08-21: Reserve the controller for orchestration and run UCMS builds only on agents.
def jenkins = Jenkins.get()

if (jenkins.numExecutors != 0) {
  jenkins.setNumExecutors(0)
  jenkins.save()
  println('UCMS Jenkins: controller executors set to 0')
}
