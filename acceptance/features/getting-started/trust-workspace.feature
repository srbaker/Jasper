Feature: Trusting your workspace

  The first time you open a project folder, VS Code asks whether you trust its
  authors before it runs any of the folder's code. Jasper's work — compiling
  Smalltalk, serving a web app, debugging — runs code, so you grant trust once per
  project and then get on with it.

  @trust
  Scenario: VS Code asks whether to trust the workspace
    Given I open a project folder VS Code has not seen before
    Then VS Code asks whether I trust the authors
    When I trust the authors
    Then the workspace is trusted
