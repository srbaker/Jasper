Feature: A project's Rowan settings

  A Rowan project's manifest is a .ston file. Rather than making you hand-edit
  STON, Jasper opens it in a settings editor — a form over the project's metadata,
  its dependencies, and (when connected) whether the image matches disk.

  @rowan-project
  Scenario: Viewing the project manifest as settings
    Given I have opened the HelloRowan project
    When I open the project manifest as settings
    Then the STON settings editor shows the project
