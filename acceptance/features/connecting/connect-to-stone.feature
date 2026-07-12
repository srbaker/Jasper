Feature: Connecting to a stone

  With a login configured for a running stone, one click opens a live GemStone
  session — the session you execute code, browse classes, and debug against. This
  is the moment Jasper goes from "installed" to "working".

  @stone
  Scenario: Logging in opens a live session
    Given a login is configured for the test stone
    When I log in
    Then a live session appears under the login

  @stone
  Scenario: A stone you disconnect from stays one click away under Recent
    Given I am logged in to the test stone
    When I log out
    Then the stone appears under Recent

  @stone
  Scenario: Adding another login from the Sessions view
    Given a login is configured for the test stone
    When I add a login from the Sessions view
    Then a form for a new login appears

  @stone
  Scenario: Committing the session's work
    Given I am logged in to the test stone
    When I commit the session
    Then the commit succeeds

  @stone
  Scenario: Aborting the session's changes
    Given I am logged in to the test stone
    When I abort the session
    Then the abort succeeds
