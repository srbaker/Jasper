Feature: The GemStone Manager

  Versions, databases, and OS setup live in one place — the GemStone Manager, a
  panel you open from the gear in the GemStone sidebar header. It replaces a
  scatter of admin trees with a single console for your environment: the GemStone
  releases you have, the databases you can run, and whether the OS is set up for
  shared memory.

  @manager
  Scenario: Opening the GemStone Manager
    When I open the GemStone Manager
    Then it shows the Operating System, Versions, and Databases sections
