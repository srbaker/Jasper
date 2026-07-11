Feature: Executing Smalltalk

  A live session is a Smalltalk workspace: type an expression, Display It, and the
  result appears right there. This is the heartbeat of GemStone development — the
  loop you live in.

  @stone
  Scenario: Display It shows an expression's value
    Given I am logged in to the test stone
    When I Display It on "3 + 4" in a workspace
    Then the value "7" is shown
