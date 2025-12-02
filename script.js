// =========================================================
// CONFIGURATION
// =========================================================
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
// =========================================================

let currentSchema = "No file uploaded. User is asking general questions.";
let chartInstance = null;

// UI Elements
const welcomeScreen = document.getElementById('welcome-screen');
const dashboard = document.getElementById('dashboard');
const startBtn = document.getElementById('start-btn');
const fileInput = document.getElementById('db-upload');
const fileStatus = document.getElementById('file-status');
const schemaList = document.getElementById('schema-list');
const suggestionList = document.getElementById('suggestion-list');
const suggestionLoader = document.getElementById('suggestion-loader');
const generateBtn = document.getElementById('generate-btn');
const questionInput = document.getElementById('user-question');
const sqlOutput = document.getElementById('sql-output');
const resultTable = document.getElementById('result-table');
const loadingIndicator = document.getElementById('loading-indicator');
const explanationText = document.getElementById('explanation-text');

// 1. Initialize App
startBtn.addEventListener('click', () => {
    welcomeScreen.style.opacity = '0';
    setTimeout(() => {
        welcomeScreen.classList.add('hidden');
        dashboard.classList.remove('hidden');
    }, 500);
});

// 2. HELPER: Call Gemini via Fetch (No SDK needed)
async function callGemini(promptText) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }]
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error.message || "API Request Failed");
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}


// 3. Handle File Upload
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    fileStatus.innerText = `Loaded: ${file.name}`;
    const reader = new FileReader();

    reader.onload = async (event) => {
        const text = event.target.result;
        let columns = [];

        if (file.name.endsWith('.csv')) {
            const lines = text.split('\n');
            if (lines.length > 0) columns = lines[0].split(',').map(c => c.trim());
        } else if (file.name.endsWith('.json')) {
            try {
                const json = JSON.parse(text);
                if (Array.isArray(json) && json.length > 0) columns = Object.keys(json[0]);
            } catch (err) {}
        }

        updateSchemaUI(file.name, columns);
        currentSchema = `Table: ${file.name}, Columns: ${columns.join(', ')}`;
        generateSuggestions();
    };
    reader.readAsText(file);
});

function updateSchemaUI(filename, columns) {
    schemaList.innerHTML = `<li><i class="fa-solid fa-table"></i> <strong>${filename}</strong></li>`;
    columns.forEach(col => {
        schemaList.innerHTML += `<li style="padding-left:20px"><i class="fa-solid fa-columns"></i> ${col}</li>`;
    });
}

// 4. AI: Suggestions
async function generateSuggestions() {
    suggestionList.innerHTML = '';
    suggestionLoader.classList.remove('hidden');

    const prompt = `
        Context: ${currentSchema}.
        Task: Suggest 3 simple analytical questions.
        Output: JSON Array of strings ONLY. No Markdown.
        Example: ["Question 1", "Question 2"]
    `;

    try {
        const text = await callGemini(prompt);
        const cleanJson = extractJSON(text);
        const questions = JSON.parse(cleanJson);

        suggestionLoader.classList.add('hidden');
        questions.forEach(q => {
            const li = document.createElement('li');
            li.innerText = q;
            li.onclick = () => questionInput.value = q;
            suggestionList.appendChild(li);
        });
    } catch (error) {
        suggestionLoader.classList.add('hidden');
        suggestionList.innerHTML = `<li>Error: ${error.message}</li>`;
    }
}

// 5. AI: Generation
generateBtn.addEventListener('click', async () => {
    const question = questionInput.value;
    if (!question) return;

    setLoading(true);

    const prompt = `
        Role: SQL Engine & Data Simulator.
        Context: ${currentSchema}.
        Question: "${question}"
        
        Requirements:
        1. Valid SQL Query.
        2. Realistic Mock Data (JSON) for the result (Max 5 rows).
        3. Brief explanation.
        
        Output Format (JSON Only):
        {
            "sql_query": "SELECT * FROM ...",
            "result_data": [ {"col": "val"} ],
            "explanation": "text...",
            "chart_type": "bar"
        }
    `;

    try {
        const text = await callGemini(prompt);
        const cleanJson = extractJSON(text);
        const data = JSON.parse(cleanJson);
        renderResults(data);
    } catch (error) {
        alert("Gemini Error: " + error.message);
    } finally {
        setLoading(false);
    }
});

function extractJSON(text) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}') + 1;
    if (start !== -1 && end !== -1) return text.substring(start, end);
    const startArr = text.indexOf('[');
    const endArr = text.lastIndexOf(']') + 1;
    if (startArr !== -1 && endArr !== -1) return text.substring(startArr, endArr);
    return text; // Fallback
}

function renderResults(data) {
    if(data.sql_query) sqlOutput.innerHTML = data.sql_query;

    const tbody = resultTable.querySelector('tbody');
    const thead = resultTable.querySelector('thead');
    tbody.innerHTML = ''; thead.innerHTML = '';
    
    if (data.result_data && data.result_data.length > 0) {
        const headers = Object.keys(data.result_data[0]);
        thead.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
        
        data.result_data.forEach(row => {
            tbody.innerHTML += `<tr>${Object.values(row).map(v => `<td>${v}</td>`).join('')}</tr>`;
        });
        
        renderChart(data.result_data, data.chart_type);
    } else {
        tbody.innerHTML = '<tr><td colspan="2" class="empty-cell">No data generated</td></tr>';
    }

    explanationText.innerText = data.explanation || "Done.";
}

function renderChart(data, type = 'bar') {
    const ctx = document.getElementById('dataChart').getContext('2d');
    const keys = Object.keys(data[0]);
    
    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: type === 'pie' ? 'pie' : 'bar',
        data: {
            labels: data.map(d => d[keys[0]]),
            datasets: [{
                label: keys[1],
                data: data.map(d => d[keys[1]]),
                backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function setLoading(state) {
    loadingIndicator.classList.toggle('hidden', !state);
    generateBtn.disabled = state;
    generateBtn.innerText = state ? "Analyzing..." : "Generate SQL";
}
