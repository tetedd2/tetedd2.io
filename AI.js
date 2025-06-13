// **สำคัญ: แก้ไข URL นี้ให้ตรงกับโมเดลของคุณจาก Teachable Machine**
// ถ้าคุณ Upload โมเดลไป Cloud:
const URL = "https://teachablemachine.withgoogle.com/models/GAu0Um0vr/";
// แทน YOUR_MODEL_ID ด้วย ID จริงๆ ของโมเดลคุณ เช่น "https://teachablemachine.withgoogle.com/models/asdfghjkl/"

// ถ้าคุณ Download โมเดลมาแล้ววางไว้ในโฟลเดอร์ my-model/:
// const URL = "./my-model/";

let model, webcam, labelContainer, maxPredictions;
let isPredicting = false; // สถานะเพื่อควบคุม loop การทำนาย
const messageElement = document.getElementById('message');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const resultDisplayElement = document.getElementById('resultDisplay'); // เพิ่ม Element สำหรับแสดงข้อมูลเพิ่มเติม

// *******************************************************************
// ** เพิ่มตัวแปรสำหรับ Logic การจับเวลาและการแสดงผลตามเงื่อนไข **
// *******************************************************************
let predictionHistory = []; // เก็บประวัติการทำนาย (เช่น 5 วินาทีล่าสุด)
const REQUIRED_CONSISTENCY_TIME_MS = 5000; // 5 วินาที
const REQUIRED_PROBABILITY = 0.9; // 90%

// ฟังก์ชันเริ่มต้น (ถูกเรียกเมื่อกดปุ่ม "เริ่มการจำแนก")
async function init() {
    messageElement.textContent = 'กำลังโหลดโมเดลและตั้งค่ากล้อง...';
    messageElement.className = 'message';
    startButton.disabled = true; // ปิดปุ่ม Start ชั่วคราว
    stopButton.disabled = true; // ปิดปุ่ม Stop ชั่วคราวในระหว่าง init
    resultDisplayElement.innerHTML = ''; // ล้างข้อมูลผลลัพธ์เก่า

    // 1. โหลดโมเดล
    const modelURL = URL + "model.json";
    const metadataURL = URL + "metadata.json";

    try {
        model = await tmImage.load(modelURL, metadataURL);
        maxPredictions = model.getTotalClasses(); // จำนวน Classes ทั้งหมดในโมเดล
    } catch (error) {
        console.error("เกิดข้อผิดพลาดในการโหลดโมเดล:", error);
        messageElement.textContent = `เกิดข้อผิดพลาดในการโหลดโมเดล: ${error.message}`;
        messageElement.className = 'message error';
        startButton.disabled = false; // เปิดปุ่ม Start กลับมา
        return;
    }

    // 2. ตั้งค่า Webcam
    const flip = false; // ปรับให้ไม่กลับด้าน (สำหรับกล้องหลัง)
    const constraints = {
        video: {
            facingMode: 'environment' // 'environment' คือกล้องหลัง, 'user' คือกล้องหน้า
        }
    };

    try {
        webcam = new tmImage.Webcam(200, 200, flip); // กว้าง, สูง, กลับด้าน
        await webcam.setup(constraints); // ขออนุญาตเข้าถึงกล้องพร้อม constraints
        await webcam.play(); // เริ่มเล่นวิดีโอจากกล้อง

        // เพิ่ม canvas ของ webcam ลงใน DOM
        document.getElementById("webcam").innerHTML = ''; // ล้าง div ก่อน
        document.getElementById("webcam").appendChild(webcam.canvas);

        isPredicting = true; // เริ่มการทำนาย
        window.requestAnimationFrame(loop); // เริ่ม loop การทำนายผล

    } catch (error) {
        console.error("เกิดข้อผิดพลาดในการตั้งค่ากล้อง:", error);
        if (error.name === 'NotAllowedError') {
            messageElement.textContent = 'ไม่ได้รับอนุญาตให้เข้าถึงกล้อง กรุณาอนุญาตในการตั้งค่าเบราว์เซอร์ของคุณ';
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
            messageElement.textContent = 'ไม่พบกล้องในอุปกรณ์ของคุณ';
        } else {
            messageElement.textContent = `เกิดข้อผิดพลาดในการตั้งค่ากล้อง: ${error.message}`;
        }
        messageElement.className = 'message error';
        startButton.disabled = false; // เปิดปุ่ม Start กลับมา
        return;
    }

    // 3. เตรียมพื้นที่สำหรับแสดงผลลัพธ์การทำนาย
    labelContainer = document.getElementById("label-container");
    labelContainer.innerHTML = ''; // ล้างเนื้อหาเดิม (ถ้ามี)
    for (let i = 0; i < maxPredictions; i++) { // สร้าง div สำหรับแต่ละ Class
        labelContainer.appendChild(document.createElement("div"));
    }

    // *******************************************************************
    // ** รีเซ็ตตัวแปรจับเวลาเมื่อเริ่มต้นใหม่ **
    // *******************************************************************
    predictionHistory = [];
    // *****************************************************************ว**

    messageElement.textContent = 'พร้อมสำหรับการจำแนก!';
    messageElement.className = 'message success';
    startButton.disabled = true; // ปิดปุ่ม Start
    stopButton.disabled = false; // เปิดปุ่ม Stop
}

// Loop หลักสำหรับการทำนายผลอย่างต่อเนื่อง
async function loop() {
    if (!isPredicting) return; // ถ้าไม่ได้อยู่ในโหมดทำนาย ให้หยุด loop

    webcam.update(); // อัปเดตเฟรมจากกล้อง
    await predict(); // ทำนายผล
    window.requestAnimationFrame(loop); // เรียกตัวเองซ้ำเพื่อทำซ้ำ
}

// ฟังก์ชันทำนายผล
async function predict() {
    // ส่งเฟรมปัจจุบันจากกล้อง (webcam.canvas) เข้าสู่โมเดลเพื่อทำนายผล
    const prediction = await model.predict(webcam.canvas);

    // เรียงลำดับผลลัพธ์ตามความน่าจะเป็นจากมากไปน้อย
    prediction.sort((a, b) => b.probability - a.probability);

    let topClassName = ''; // เก็บชื่อ Class ที่มีความน่าจะเป็นสูงสุด
    let topProbability = 0; // เก็บค่าความน่าจะเป็นสูงสุด

    // แสดงผลลัพธ์
    for (let i = 0; i < maxPredictions; i++) {
        const classPrediction = prediction[i].className + ": " + (prediction[i].probability * 100).toFixed(1) + "%";
        const predictionDiv = labelContainer.childNodes[i];

        if (i === 0) { // Class ที่มีค่าความน่าจะเป็นสูงสุดอยู่เสมอ
            topClassName = prediction[i].className;
            topProbability = prediction[i].probability;

            if (topProbability > 0.7) { // ปรับค่า 0.7 ได้ตามความเหมาะสมสำหรับไฮไลท์
                predictionDiv.className = 'highlight';

                // *******************************************************************
                // ** ส่วนที่เพิ่ม/แก้ไขสำหรับ Logic การจับเวลาและการแสดงผลตามเงื่อนไข **
                // *******************************************************************
                const currentTime = Date.now();

                // เพิ่มการทำนายปัจจุบันลงใน History (เก็บเฉพาะข้อมูลล่าสุดตามเวลาที่ต้องการ)
                predictionHistory.push({ className: topClassName, probability: topProbability, time: currentTime });
                // ลบข้อมูลที่เก่าเกิน REQUIRED_CONSISTENCY_TIME_MS ออกไป
                predictionHistory = predictionHistory.filter(p => currentTime - p.time <= REQUIRED_CONSISTENCY_TIME_MS);

                // ตรวจสอบความต่อเนื่องของ Class และความน่าจะเป็น
                let isConsistentAndHighConfidence = true;
                if (predictionHistory.length > 0) {
                    // ตรวจสอบว่าทุกการทำนายใน history เป็น class เดียวกันและมีความน่าจะเป็นตามที่กำหนด
                    for (let p of predictionHistory) {
                        if (p.className !== topClassName || p.probability < REQUIRED_PROBABILITY) {
                            isConsistentAndHighConfidence = false;
                            break;
                        }
                    }
                    // ตรวจสอบว่ามีข้อมูลใน History เพียงพอสำหรับระยะเวลาที่ต้องการ
                    if (predictionHistory.length > 0 && (predictionHistory[predictionHistory.length - 1].time - predictionHistory[0].time) < REQUIRED_CONSISTENCY_TIME_MS) {
                        isConsistentAndHighConfidence = false;
                    }
                } else {
                    isConsistentAndHighConfidence = false; // ถ้าไม่มีประวัติก็ไม่ถือว่า Consistent
                }


                // Logic สำหรับการแสดงผลพิเศษ (D1, D2, D3, D4, D5 ) และหยุดการจำแนก
                if (isConsistentAndHighConfidence) {
                    resultDisplayElement.className = 'important-message';
                    if (topClassName === "D2") {
                        resultDisplayElement.innerHTML = "<h3>🚨 เป็นโรคจุดราขาว 🚨</h3>";
                        stopCamera(); // เรียกฟังก์ชันหยุดการจำแนก
                    } else if (topClassName === "D1") {
                        resultDisplayElement.innerHTML = "<h3>✅ ปลอดเชื้อโรค ✅</h3>";
                        stopCamera(); // เรียกฟังก์ชันหยุดการจำแนก
                    } else if (topClassName === "D3") {
                        resultDisplayElement.innerHTML = "<h3>🚨 เป็นโรคสนิม 🚨</h3>";
                        stopCamera(); // เรียกฟังก์ชันหยุดการจำแนก
                    } else if (topClassName === "D4") {
                        resultDisplayElement.innerHTML = "<h3>🚨 เป็นโรคใบไหม้ 🚨</h3>";
                        stopCamera(); // เรียกฟังก์ชันหยุดการจำแนก
                    } else if (topClassName === "D5") {
                        resultDisplayElement.innerHTML = "<h3>🚨 กรุณาถ่ายใหม่ 🚨</h3>";
                        stopCamera(); // เรียกฟังก์ชันหยุดการจำแนก
                    } else {
                        // ถ้าเป็น Class อื่นๆ ที่เข้าเงื่อนไข 5 วินาที 90% แต่ไม่ใช่ D1/D2
                        resultDisplayElement.innerHTML = `<h4>💡 โมเดลมั่นใจใน "${topClassName}" มากกว่า 5 วินาที!</h4><p>ความน่าจะเป็น: ${ (topProbability * 100).toFixed(1)}%</p>`;
                        resultDisplayElement.className = 'info-message';
                    }
                } else {
                    // ถ้ายังไม่ตรงเงื่อนไข 5 วินาที 90% ก็แสดงผลลัพธ์ปกติของคุณ
                    resultDisplayElement.className = ''; // ล้าง class ก่อน
                    resultDisplayElement.innerHTML = `<p>กำลังรอการจำแนก... (ความน่าจะเป็นยังไม่สูงพอ หรือยังไม่ต่อเนื่อง)</p>`;
                    resultDisplayElement.className = 'info-message';
                }
                // *******************************************************************
            } else { // ถ้าความน่าจะเป็นสูงสุดไม่ถึงเกณฑ์ที่ตั้งไว้
                predictionDiv.className = '';
                resultDisplayElement.innerHTML = '<p>กำลังรอการจำแนก... (ความน่าจะเป็นยังไม่สูงพอ)</p>';
                resultDisplayElement.className = 'info-message';

                // *******************************************************************
                // ** รีเซ็ตสถานะการจับเวลาเมื่อความน่าจะเป็นไม่ถึงเกณฑ์ **
                // *******************************************************************
                predictionHistory = [];
                // *******************************************************************
            }
        } else {
            predictionDiv.className = '';
        }
        predictionDiv.innerHTML = classPrediction;
    }
}

// ฟังก์ชันสำหรับหยุดการทำงานของกล้องและการทำนาย
async function stopCamera() {
    isPredicting = false; // หยุด loop การทำนาย (สำคัญมาก)
    if (webcam) {
        webcam.stop(); // หยุดกล้องจริง ๆ
        // ล้าง canvas ของกล้อง
        const webcamDiv = document.getElementById("webcam");
        if (webcamDiv) {
            webcamDiv.innerHTML = '<p>กล้องหยุดทำงานแล้ว</p>'; // เพิ่มข้อความแจ้งสถานะ
        }
    }
    labelContainer.innerHTML = ''; // ล้างผลการทำนาย
    // resultDisplayElement.innerHTML = ''; // ไม่ล้างผลลัพธ์ D1/D2 ทิ้งทันที แต่ให้คงไว้
    messageElement.textContent = 'กล้องและโมเดลหยุดทำงานแล้ว'; // ข้อความสถานะหลัก
    messageElement.className = 'message';
    startButton.disabled = false; // เปิดปุ่ม Start
    stopButton.disabled = true; // ปิดปุ่ม Stop

    // *******************************************************************
    // ** รีเซ็ตตัวแปรจับเวลาเมื่อหยุดกล้อง **
    // *******************************************************************
    predictionHistory = [];
    // *******************************************************************
}


// เพิ่ม Event Listener ให้กับปุ่ม
startButton.addEventListener('click', init); // คลิก Start -> เรียก init()
stopButton.addEventListener('click', stopCamera); // คลิก Stop -> เรียก stopCamera()

// จัดการเมื่อผู้ใช้ปิดหน้าเว็บ ให้หยุดกล้อง
window.addEventListener('beforeunload', () => {
    if (webcam) {
        webcam.stop();
    }
});