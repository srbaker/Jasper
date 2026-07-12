Feature: The GemStone sidebar

  Jasper adds a GemStone activity to VS Code — a dedicated place in the sidebar to
  start working with a stone. At the top, the Login launcher connects you to a
  database; below it are your Rowan projects. Versions, databases, and OS setup
  live one click away in the GemStone Manager, reached from the gear in the section
  header. This is the door you walk through to start working, so it is the first
  screen of the manual.

  @smoke
  Scenario: Opening the GemStone sidebar
    Given a fresh VS Code with the Jasper extension
    When I open the GemStone sidebar
    Then I see the GemStone views
