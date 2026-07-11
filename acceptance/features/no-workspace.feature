Feature: A folder must be open to log in

  Jasper works against the files in your workspace — the project on disk is the
  starting point for everything you do — so a folder has to be open before you can
  log in to a stone. Rather than failing quietly, Jasper points you at the fix.

  @no-workspace
  Scenario: Logging in with no folder open guides you to open one
    Given I have opened Jasper without a folder
    When I try to log in
    Then Jasper asks me to open a folder first
