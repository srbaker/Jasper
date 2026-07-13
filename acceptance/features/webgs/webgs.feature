Feature: Building a web app with WebGS and Rowan

  WebGS is a small framework for building web back-ends in GemStone Smalltalk:
  you subclass WebApp and each method you add becomes an HTTP endpoint that
  answers with Smalltalk-generated JSON. This chapter builds a real one on a fresh
  Rowan-enabled stone — load WebGS from GitHub with Rowan, stand up an endpoint,
  view it in the editor, change it, and watch the change persist back to Rowan.

  @stone
  Scenario: Loading WebGS from GitHub into the image
    Given I am logged in to the test stone
    When I clone and load WebGS from GitHub
    Then WebGS appears under Loaded Projects

  @stone
  Scenario: The Web Apps view lists your endpoints
    Given I am logged in to the test stone
    And I have loaded the WebGS examples
    When I open the Web Apps view
    Then the Sample app lists its counter.gs endpoint
