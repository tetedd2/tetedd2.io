
// กำหนด URL ของโมเดล Teachable Machine
const URL = "https://teachablemachine.withgoogle.com/models/GAu0Um0vr/";  
let model, labelContainer, maxPredictions;
let isPredicting = false;
let currentFacingMode = 'environment'; // เริ่มต้นใช้กล้องหลัง
let videoElement;
let stream;

// อ้างอิง DOM Elements
const messageElement = document.getElementById('message');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const switchCameraButton = document.getElementById('switchCameraButton');
const resultDisplayElement = document.getElementById('resultDisplay');
const actionButtonsDiv = document.getElementById('actionButtons');
const infoButtonsDiv = document.getElementById('infoButtons');
const causeButton = document.getElementById('causeButton');
const treatmentButton = document.getElementById('treatmentButton');

// Logic สำหรับจับเวลาและการแสดงผลตามความน่าจะเป็น
let predictionHistory = [];
const REQUIRED_CONSISTENCY_TIME_MS = 2000; // 2 วินาที
const REQUIRED_PROBABILITY = 0.9; // 90%

// ฟังก์ชันแสดง/ซ่อนปุ่มสาเหตุและรักษา
function toggleInfoButtons(show) {
    if (show) {
        infoButtonsDiv.classList.remove('hidden');
        actionButtonsDiv.classList.add('hidden');
    } else {
        infoButtonsDiv.classList.add('hidden');
        actionButtonsDiv.classList.remove('hidden');
    }
}

// ฟังก์ชันเริ่มต้นเมื่อกด "เริ่มการจำแนก"
async function init() {
    messageElement.textContent = 'กำลังโหลดโมเดลและตั้งค่ากล้อง...';
    messageElement.className = 'message';
    startButton.disabled = true;
    stopButton.disabled = true;
    switchCameraButton.disabled = true;
    toggleInfoButtons(false);
    resultDisplayElement.innerHTML = '';
    predictionHistory = [];

    const modelURL = URL + "model.json";
    const metadataURL = URL + "metadata.json";

    try {
        model = await tmImage.load(modelURL, metadataURL);
        maxPredictions = model.getTotalClasses();
    } catch (error) {
        console.error("เกิดข้อผิดพลาดในการโหลดโมเดล:", error);
        messageElement.textContent = `เกิดข้อผิดพลาดในการโหลดโมเดล: ${error.message}`;
        messageElement.className = 'message error';
        startButton.disabled = false;
        return;
    }

    await setupCamera();

    labelContainer = document.getElementById("label-container");
    labelContainer.innerHTML = '';
    for (let i = 0; i < maxPredictions; i++) {
        labelContainer.appendChild(document.createElement("div"));
    }

    messageElement.textContent = 'พร้อมสำหรับการจำแนก!';
    messageElement.className = 'message success';
    startButton.disabled = true;
    stopButton.disabled = false;
    switchCameraButton.disabled = false;
}

// ตั้งค่ากล้องผ่าน getUserMedia
async function setupCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }

    const constraints = {
        video: {
            width: { ideal: 320 },
            height: { ideal: 240 },
            facingMode: currentFacingMode
        }
    };

    try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);

        videoElement = document.createElement('video');
        videoElement.width = 320;
        videoElement.height = 240;
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        videoElement.muted = true;
        videoElement.srcObject = stream;

        const webcamDiv = document.getElementById("webcam");
        if (!webcamDiv) throw new Error("ไม่พบ DIV #webcam");

        webcamDiv.innerHTML = '';
        webcamDiv.appendChild(videoElement);

        await new Promise(resolve => {
            videoElement.onloadedmetadata = () => {
                videoElement.play(); // Safari/iOS ต้องการคำสั่งนี้
                resolve();
            };
            setTimeout(() => {
                console.warn("Timeout ขณะรอ metadata");
                resolve();
            }, 3000);
        });

        isPredicting = true;
        window.requestAnimationFrame(loop);
    } catch (error) {
        console.error("เกิดข้อผิดพลาดในการตั้งค่ากล้อง:", error);
        let errorMsg = 'ไม่สามารถเข้าถึงกล้องได้';
        if (error.name === 'NotAllowedError') {
            errorMsg = 'ไม่ได้รับอนุญาตให้เข้าถึงกล้อง กรุณาอนุญาตในเบราว์เซอร์';
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
            errorMsg = 'ไม่พบกล้องในอุปกรณ์ของคุณ';
        } else if (error.name === 'NotReadableError') {
            errorMsg = 'กล้องอาจถูกใช้งานโดยแอปอื่นหรือมีปัญหาฮาร์ดแวร์';
        }
        messageElement.textContent = errorMsg;
        messageElement.className = 'message error';
        startButton.disabled = false;
        stopButton.disabled = true;
        switchCameraButton.disabled = true;
        isPredicting = false;
        toggleInfoButtons(false);
    }
}

// Loop หลักสำหรับการทำนาย
async function loop() {
    if (!isPredicting) return;
    await predict();
    window.requestAnimationFrame(loop);
}

// ฟังก์ชันทำนายผล
async function predict() {
    if (!videoElement || videoElement.readyState < videoElement.HAVE_ENOUGH_DATA) return;

    const prediction = await model.predict(videoElement);
    prediction.sort((a, b) => b.probability - a.probability);

    let topClassName = '';
    let topProbability = 0;

    for (let i = 0; i < maxPredictions; i++) {
        const classPrediction = prediction[i].className + ": " + (prediction[i].probability * 100).toFixed(1) + "%";
        const predictionDiv = labelContainer.childNodes[i];

        if (i === 0) {
            topClassName = prediction[i].className;
            topProbability = prediction[i].probability;
            const currentTime = Date.now();

            if (topProbability > 0.7) {
                predictionHistory.push({ className: topClassName, probability: topProbability, time: currentTime });
                predictionDiv.className = 'highlight';
            } else {
                predictionHistory = [];
                predictionDiv.className = '';
            }

            predictionHistory = predictionHistory.filter(p => currentTime - p.time <= REQUIRED_CONSISTENCY_TIME_MS);

            let isConsistentAndHighConfidence = true;
            if (predictionHistory.length > 0) {
                for (let p of predictionHistory) {
                    if (p.className !== topClassName || p.probability < REQUIRED_PROBABILITY) {
                        isConsistentAndHighConfidence = false;
                        break;
                    }
                }
                if ((predictionHistory[predictionHistory.length - 1].time - predictionHistory[0].time) < REQUIRED_CONSISTENCY_TIME_MS) {
                    isConsistentAndHighConfidence = false;
                }
            } else {
                isConsistentAndHighConfidence = false;
            }

            if (isConsistentAndHighConfidence) {
                resultDisplayElement.className = 'important-message';
                let showInfoButtons = false;
                let diseaseName = '';

                if (topClassName === "D2") {
                    resultDisplayElement.innerHTML = "<h3>🚨 เป็นโรคจุดราขาว 🚨</h3>";
                    diseaseName = "จุดราขาว";
                    showInfoButtons = true;
                } else if (topClassName === "D4") {
                    resultDisplayElement.innerHTML = "<h3>🚨 เป็นโรคใบไหม้ 🚨</h3>";
                    diseaseName = "ใบไหม้";
                    showInfoButtons = true;
                } else if (topClassName === "D3") {
                    resultDisplayElement.innerHTML = "<h3>🚨 เป็นโรคสนิม 🚨</h3>";
                    diseaseName = "สนิม";
                    showInfoButtons = true;
                } else if (topClassName === "D1") {
                    resultDisplayElement.innerHTML = "<h3>✅ ปลอดเชื้อโรค ✅</h3>";
                } else if (topClassName === "D5") {
                    resultDisplayElement.innerHTML = "<h3>🚨 กรุณาถ่ายใหม่ 🚨</h3>";
                } else {
                    resultDisplayElement.innerHTML = `<h4>💡 โมเดลมั่นใจใน "${topClassName}" มากกว่า 2 วินาที!</h4><p>ความน่าจะเป็น: ${(topProbability * 100).toFixed(1)}%</p>`;
                    resultDisplayElement.className = 'info-message';
                }

                stopCamera();
                toggleInfoButtons(showInfoButtons);
            } else {
                resultDisplayElement.className = 'info-message';
                if (predictionHistory.length > 0) {
                    const timeElapsed = predictionHistory[predictionHistory.length - 1].time - predictionHistory[0].time;
                    const remainingTime = Math.ceil((REQUIRED_CONSISTENCY_TIME_MS - timeElapsed) / 1000);
                    resultDisplayElement.innerHTML = `<p>กำลังรอการยืนยัน "${topClassName}"...<br>ความน่าจะเป็น: ${(topProbability * 100).toFixed(1)}%<br>ต้องมั่นใจต่อเนื่องอีกประมาณ ${remainingTime} วินาที</p>`;
                } else {
                    resultDisplayElement.innerHTML = `<p>กำลังรอการจำแนก...<br>ความน่าจะเป็นของ "${topProbability > 0 ? topClassName : 'บางสิ่ง'}": ${(topProbability * 100).toFixed(1)}%<br>ยังไม่สูงพอ หรือยังไม่ต่อเนื่อง</p>`;
                }
                toggleInfoButtons(false);
            }
        }
        predictionDiv.innerHTML = classPrediction;
    }
}

// หยุดกล้อง
async function stopCamera() {
    isPredicting = false;
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    if (videoElement) {
        videoElement.srcObject = null;
    }
    const webcamDiv = document.getElementById("webcam");
    if (webcamDiv) {
        webcamDiv.innerHTML = '<p>กล้องหยุดทำงานแล้ว</p>';
    }
    labelContainer.innerHTML = '';
    messageElement.textContent = 'กล้องและโมเดลหยุดทำงานแล้ว';
    messageElement.className = 'message';
    startButton.disabled = false;
    stopButton.disabled = true;
    switchCameraButton.disabled = true;
    predictionHistory = [];
}

// สลับกล้อง
async function switchCamera() {
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    isPredicting = false;
    messageElement.textContent = 'กำลังสลับกล้อง...';
    messageElement.className = 'message';
    startButton.disabled = true;
    stopButton.disabled = true;
    switchCameraButton.disabled = true;

    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    if (videoElement) {
        videoElement.srcObject = null;
        document.getElementById("webcam").innerHTML = '';
    }

    await setupCamera();

    messageElement.textContent = 'พร้อมสำหรับการจำแนก!';
    messageElement.className = 'message success';
    startButton.disabled = true;
    stopButton.disabled = false;
    switchCameraButton.disabled = false;
}

// Event Listeners
startButton.addEventListener('click', init);
stopButton.addEventListener('click', stopCamera);
switchCameraButton.addEventListener('click', switchCamera);

// ปุ่ม "สาเหตุ" และ "รักษา"
causeButton.addEventListener('click', () => {
    const resultText = resultDisplayElement.querySelector('h3')?.textContent.trim() || '';
    let url = 'bad.html';

    if (resultText.includes('จุดราขาว')) {
        url = 'bad2.html';
    } else if (resultText.includes('สนิม')) {
        url = 'bad3.html';
    } else if (resultText.includes('ใบไหม้')) {
        url = 'bad4.html';
    }

    const diseaseName = resultText.replace(/[🚨✅]/g, '').trim();
    window.open(`${url}?disease=${encodeURIComponent(diseaseName)}`, '_blank');
});

treatmentButton.addEventListener('click', () => {
    const resultText = resultDisplayElement.querySelector('h3')?.textContent.trim() || '';
    let url = 'health.html';

    if (resultText.includes('จุดราขาว')) {
        url = 'health2.html';
    } else if (resultText.includes('สนิม')) {
        url = 'health3.html';
    } else if (resultText.includes('ใบไหม้')) {
        url = 'health4.html';
    }

    const diseaseName = resultText.replace(/[🚨✅]/g, '').trim();
    window.open(`${url}?disease=${encodeURIComponent(diseaseName)}`, '_blank');
});

// เมื่อโหลดหน้าเว็บเสร็จให้ซ่อนปุ่ม "สาเหตุ" และ "รักษา"
window.addEventListener('DOMContentLoaded', () => {
    toggleInfoButtons(false);
    stopButton.disabled = true;
    switchCameraButton.disabled = true;
});

// ปิดกล้องเมื่อออกจากหน้าเว็บ
window.addEventListener('beforeunload', () => {
    stopCamera();
});