Feature: Executing Smalltalk

  A live session is a Smalltalk workspace: type an expression, Display It, and the
  result appears right there. This is the heartbeat of GemStone development — the
  loop you live in.

  @stone
  Scenario: Display It shows an expression's value
    Given I am logged in to the test stone
    When I open a workspace
    And I enter the expression "17 * 3"
    And I Display It
    Then the result "51" is shown

  @stone
  Scenario: Execute It runs code for its effect
    Given I am logged in to the test stone
    When I open a workspace
    And I enter the expression "Transcript show: 'jasper executed 42'"
    And I Execute It
    Then the Transcript shows "jasper executed 42"

  @stone
  Scenario: Inspect It opens the result in the inspector
    Given I am logged in to the test stone
    When I open a workspace
    And I enter the expression "3 + 4"
    And I Inspect It
    Then the inspector shows "7"
