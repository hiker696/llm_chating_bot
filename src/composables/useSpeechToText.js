import { ref, computed } from "vue";

export function useSpeechToText() {
  const transcript = ref("");
  const isListening = ref(false);
  const isSpeaking = ref(false);
  const error = ref(null);

  // 获取浏览器的 SpeechRecognition API
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = SpeechRecognition ? new SpeechRecognition() : null;
  const synth = window.speechSynthesis;

  if (recognition) {
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "zh-CN";

    recognition.onstart = () => {
      isListening.value = true;
      error.value = null;
    };

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptSegment = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          transcript.value += transcriptSegment;
        } else {
          interim += transcriptSegment;
        }
      }
    };

    recognition.onerror = (event) => {
      error.value = `语音识别错误: ${event.error}`;
    };

    recognition.onend = () => {
      isListening.value = false;
    };
  }

  function startListening() {
    if (!recognition) {
      error.value = "浏览器不支持语音识别";
      return;
    }
    transcript.value = "";
    recognition.start();
  }

  function stopListening() {
    if (recognition) {
      recognition.stop();
    }
  }

  function clearTranscript() {
    transcript.value = "";
  }

  function playText(text) {
    if (!synth) {
      error.value = "浏览器不支持语音合成";
      return;
    }

    // 取消之前的播放
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onstart = () => {
      isSpeaking.value = true;
    };

    utterance.onend = () => {
      isSpeaking.value = false;
    };

    utterance.onerror = (event) => {
      error.value = `语音播放错误: ${event.error}`;
      isSpeaking.value = false;
    };

    synth.speak(utterance);
  }

  function stopPlayback() {
    if (synth) {
      synth.cancel();
      isSpeaking.value = false;
    }
  }

  const isSupported = computed(() => !!recognition && !!synth);

  return {
    transcript,
    isListening,
    isSpeaking,
    error,
    isSupported,
    startListening,
    stopListening,
    clearTranscript,
    playText,
    stopPlayback,
  };
}
