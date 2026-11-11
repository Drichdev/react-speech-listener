# Notice

This library is a TypeScript reimplementation inspired by the architecture and API of
[react-speech-recognition](https://github.com/JamesBrill/react-speech-recognition) (MIT, © James Brill).
No code is copied verbatim, but some ideas are reused:

- Voice-command syntax (`*`, `:name`, `(optional)`) is derived from Backbone.Router (MIT, Jeremy Ashkenas).
- Fuzzy similarity uses the Dice coefficient over bigrams (the algorithm used by `string-similarity`, MIT).

The browser API used is the Web Speech API:
https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
