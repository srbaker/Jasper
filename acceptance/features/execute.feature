Feature: Executing Smalltalk

  A live session is a Smalltalk workspace: type an expression, Display It, and the
  result appears right there. This is the heartbeat of GemStone development — the
  loop you live in.

  @stone
  Scenario: Display It shows an expression's value
    Given I am logged in to the test stone
    When I open a workspace
    And I enter the expression "3 + 4"
    And I Display It
    Then the result "7" is shown
