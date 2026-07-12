Feature: Navigating code

  Reading Smalltalk, you constantly ask two questions: who implements this message,
  and who sends it. Jasper answers both — every matching method, listed to jump to.

  @stone
  Scenario: Finding implementors of a message
    Given I am logged in to the test stone
    When I look up implementors of "printString"
    Then matching methods are listed

  @stone
  Scenario: Finding senders of a message
    Given I am logged in to the test stone
    When I look up senders of "printString"
    Then matching methods are listed
