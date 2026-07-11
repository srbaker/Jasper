Feature: The GemStone sidebar

  Jasper adds a GemStone activity to VS Code — a dedicated place in the sidebar
  for everything you do with a stone: the versions you have installed, your
  databases, your logins and sessions, and your Rowan projects. This is the door
  you walk through to start working, so it is the first screen of the manual.

  @smoke
  Scenario: Opening the GemStone sidebar
    Given a fresh VS Code with the Jasper extension
    When I open the GemStone sidebar
    Then I see the GemStone views
