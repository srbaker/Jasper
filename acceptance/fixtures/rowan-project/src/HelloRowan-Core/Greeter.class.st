Class {
	#name : 'Greeter',
	#superclass : 'Object',
	#category : 'HelloRowan-Core'
}

{ #category : 'greeting' }
Greeter >> greet: aName [
	"Answer a friendly greeting for aName."
	^ 'Hello, ', aName, '!'
]

{ #category : 'greeting' }
Greeter >> greeting [
	"Answer the default greeting."
	^ self greet: 'world'
]
