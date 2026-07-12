Feature: The Stage Browser

  The Stage Browser is Jasper's class browser — a cascade of panes for the image:
  dictionaries, class categories, classes, the hierarchy, and methods. Connect to
  a stone and it fills with the classes actually in your image; find a class and
  the panes home in on it.

  @stone
  Scenario: Browsing to a class and its methods
    Given I am logged in to the test stone
    When I find the "Array" class in the browser
    Then the "Array" class is shown in the Classes pane
    And its methods appear in the Methods pane

  @stone
  Scenario: Seeing where a class sits in the hierarchy
    Given I am logged in to the test stone
    When I find the "Array" class in the browser
    Then the hierarchy shows "Object" above "Array"
