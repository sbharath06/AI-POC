class VoiceController {
    constructor() {
        this.isListening = false;
        this.recognition = null;
        this.synthesis = window.speechSynthesis;
        this.onResultCallback = null;
        
        this.init();
    }

    init() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.interimResults = false;
            this.recognition.lang = 'en-IN'; // Or configurable

            this.recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                if (this.onResultCallback) {
                    this.onResultCallback(transcript);
                }
                this.stopListening();
            };

            this.recognition.onerror = (event) => {
                console.error('Speech recognition error', event.error);
                this.stopListening();
            };

            this.recognition.onend = () => {
                this.isListening = false;
            };
        }
    }

    isSupported() {
        return this.recognition !== null;
    }

    startListening(onResultCallback) {
        if (!this.isSupported()) {
            console.error('Speech recognition not supported in this browser.');
            return;
        }

        this.onResultCallback = onResultCallback;
        
        try {
            this.recognition.start();
            this.isListening = true;
            
            // Auto stop after 10 seconds if no result
            setTimeout(() => {
                if (this.isListening) {
                    this.stopListening();
                }
            }, 10000);
            
        } catch (e) {
            console.error('Error starting recognition:', e);
            this.isListening = false;
        }
    }

    stopListening() {
        if (this.isSupported() && this.isListening) {
            this.recognition.stop();
            this.isListening = false;
        }
    }

    speak(text) {
        if (!this.synthesis) return;
        
        this.stopSpeaking(); // Stop any ongoing speech
        
        // Strip markdown before speaking
        const plainText = text.replace(/[*#_`~]/g, '');
        
        const utterance = new SpeechSynthesisUtterance(plainText);
        
        // Try to find a good voice
        let voices = this.synthesis.getVoices();
        let selectedVoice = voices.find(v => v.name.includes('Google') && v.lang.startsWith('en')) 
                         || voices.find(v => v.lang === 'en-US' || v.lang === 'en-GB') 
                         || voices[0];
                         
        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }
        
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        
        this.synthesis.speak(utterance);
    }

    stopSpeaking() {
        if (this.synthesis && this.synthesis.speaking) {
            this.synthesis.cancel();
        }
    }
}
