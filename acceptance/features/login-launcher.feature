Feature: The Login Launcher

  The Login launcher sits at the top of the GemStone sidebar — a compact,
  Run-and-Debug-style control for picking a login and connecting to its stone.
  Before you've configured one, it points you at adding it.

  @launcher
  Scenario: The launcher invites you to add a login
    Given a fresh VS Code with the Jasper extension
    When I open the GemStone sidebar
    Then the launcher shows "No logins yet" with a way to add one
