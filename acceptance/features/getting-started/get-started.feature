Feature: Getting started from a blank slate

  On a fresh install — no sessions, no logins — the Sessions view doesn't leave you
  guessing. It offers three ways in: one click to get going with the latest GemStone,
  a guided setup, or connecting to a stone you already run.

  @firstrun
  Scenario: The Sessions view offers the get-started choices
    Given a fresh VS Code with the Jasper extension
    When I open the GemStone sidebar
    Then I am offered to get started in one click
    And I can choose to set up with options
    And I can choose to connect to an existing stone
