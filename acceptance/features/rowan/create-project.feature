Feature: Creating a Rowan project

  You don't need a stone to start authoring. From an empty folder, one click turns
  it into a Rowan project — Jasper generates the project structure on disk, ready
  for packages and classes, to be loaded into an image later.

  @rowan-create
  Scenario: Turning an empty folder into a Rowan project
    Given I have opened an empty folder
    When I create a Rowan project from the Rowan view
    Then the folder becomes a Rowan project
