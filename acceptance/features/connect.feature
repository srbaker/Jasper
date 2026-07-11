Feature: Connecting to a stone

  With a login configured for a running stone, one click opens a live GemStone
  session — the session you execute code, browse classes, and debug against. This
  is the moment Jasper goes from "installed" to "working".

  @stone
  Scenario: Logging in opens a live session
    Given a login is configured for the test stone
    When I log in
    Then a live session appears under the login
