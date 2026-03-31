const apiKey = 'ec5831135a531b167faa8ef10d403238'; // Replace with your actual API Key
const searchBtn = document.getElementById('search-btn');
const cityInput = document.getElementById('city-input');
const weatherContainer = document.getElementById('weather-container');
const loader = document.getElementById('loader');
const resultsContainer = document.getElementById('results-container');

let clockInterval;
let refreshInterval;

searchBtn.addEventListener('click', () => {
    const city = cityInput.value.trim();
    if (city) {
        cityInput.blur(); // Dismisses mobile keyboard to show results
        getWeatherData(city);
    }
});

async function getWeatherData(city) {
    try {
        // Reset UI state
        weatherContainer.classList.add('hidden');
        resultsContainer.classList.add('hidden');
        loader.classList.remove('hidden');

        // 1. Fetch more results (limit=10) to ensure local municipalities like San Juan, Ilocos Sur appear
        const geoRes = await fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=10&appid=${apiKey}`);
        const geoData = await geoRes.json();

        if (!geoData || geoData.length === 0) throw new Error("City not found");

        if (geoData.length > 1) {
            displayLocationResults(geoData);
            loader.classList.add('hidden');
        } else {
            const { name: placeName, state, country, lat, lon } = geoData[0];
            fetchWeatherDetails(lat, lon, placeName, state, country);
        }
    } catch (error) {
        console.error("Weather fetch error:", error);
        alert("Error: " + error.message);
        loader.classList.add('hidden');
    }
}

async function fetchWeatherDetails(lat, lon, placeName, state, country) {
    try {
        resultsContainer.classList.add('hidden');
        loader.classList.remove('hidden');
        weatherContainer.classList.add('hidden');

        // Ensure state is passed correctly for display
        const province = state || "";

        // 2. Fetch both Current Weather and Forecast using coordinates for better accuracy
        const [currentRes, forecastRes] = await Promise.all([
            fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`),
            fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`)
        ]);

        const currentData = await currentRes.json();
        const forecastData = await forecastRes.json();

        // Check for successful responses
        if (!currentRes.ok) throw new Error(currentData.message || "City not found");
        if (!forecastRes.ok) throw new Error(forecastData.message || "Forecast unavailable");

        displayWeather(currentData, placeName, province, country, lat, lon);
        displayForecast(forecastData);
        
        // Setup auto-refresh using coordinates to maintain accuracy
        setupAutoRefresh(lat, lon, placeName, province, country);
        
        weatherContainer.classList.remove('hidden');
    } catch (error) {
        alert("Error fetching details: " + error.message);
    } finally {
        loader.classList.add('hidden');
    }
}

function displayLocationResults(results) {
    resultsContainer.innerHTML = '<div style="padding:10px; font-weight:bold; font-size:0.8rem; opacity:0.8;">Multiple locations found. Please select:</div>';
    
    results.forEach(loc => {
        const div = document.createElement('div');
        div.className = 'result-item';
        const statePart = loc.state ? `${loc.state}, ` : "";
        div.innerText = `${loc.name}, ${statePart}${loc.country}`;
        
        div.addEventListener('click', () => {
            fetchWeatherDetails(loc.lat, loc.lon, loc.name, loc.state, loc.country);
        });
        
        resultsContainer.appendChild(div);
    });
    resultsContainer.classList.remove('hidden');
}

function displayWeather(data, placeName, province, country, lat, lon) {

    let displayName = placeName;
    const stationName = data.name;
    if (stationName.toLowerCase() !== placeName.toLowerCase()) {
        displayName = `${placeName}`;
    }

    const locationDisplay = [displayName, province, country].filter(Boolean).join(', ');
    document.getElementById('city-name').innerText = locationDisplay;
    
    // Display the real GPS coordinates used for this data
    document.getElementById('coordinates').innerText = `GPS: ${lat.toFixed(4)}, ${lon.toFixed(4)}`;

    document.getElementById('current-temp-container').innerHTML = `
        <div class="temp">${Math.round(data.main.temp)}°C</div>
        <img src="https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png" alt="icon">
    `;
    const weatherData = data.weather[0];
    document.body.className = getWeatherClass(weatherData);
    document.getElementById('weather-description').innerText = weatherData.description.toUpperCase();
    document.getElementById('last-updated').innerText = `Last updated: ${new Date().toLocaleTimeString()}`;


    startLiveClock(data.timezone);
}

function startLiveClock(timezoneOffset) {
    if (clockInterval) clearInterval(clockInterval);

    const updateClock = () => {
        const now = new Date();
        // Calculate UTC time then apply city offset
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const cityTime = new Date(utc + (timezoneOffset * 1000));
        
        document.getElementById('local-time').innerText = cityTime.toLocaleTimeString([], { 
            weekday: 'long', 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });
    };

    updateClock();
    clockInterval = setInterval(updateClock, 1000);
}

function getWeatherClass(weather) {
    const main = weather.main.toLowerCase();
    const icon = weather.icon;

    // Day/Night
    const isDay = icon.endsWith('d');
    const isNight = icon.endsWith('n');

    // Main conditions
    if (main === 'clear') return isDay ? 'clear-day' : 'clear-night';
    if (main === 'clouds') return 'cloudy';
    if (main.includes('rain') || icon.startsWith('09') || icon.startsWith('10')) return 'rain';
    if (main === 'thunderstorm' || icon.startsWith('11')) return 'thunderstorm';
    if (main.includes('snow') || icon.startsWith('13')) return 'snow';
    if (main === 'mist' || main === 'fog' || main === 'haze' || icon.startsWith('50')) return 'fog';
    return 'default';
}

function setupAutoRefresh(lat, lon, name, state, country) {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => fetchWeatherDetails(lat, lon, name, state, country), 600000); 
}

function displayForecast(data) {
    const forecastContainer = document.getElementById('forecast-container');
    forecastContainer.innerHTML = '';

    // OpenWeatherMap 5-day forecast returns data every 3 hours. 
    // We filter to get one reading per day (at 12:00:00).
    const dailyData = data.list.filter(item => item.dt_txt.includes("12:00:00"));

    dailyData.forEach(day => {
        const date = new Date(day.dt * 1000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        
        const forecastItem = document.createElement('div');
        forecastItem.className = 'forecast-item';
        forecastItem.innerHTML = `
            <div class="forecast-date">${date}</div>
            <img src="https://openweathermap.org/img/wn/${day.weather[0].icon}.png" alt="icon">
            <div class="forecast-temp">${Math.round(day.main.temp)}°C</div>
            <div style="font-size: 0.7rem">${day.weather[0].main}</div>
        `;
        forecastContainer.appendChild(forecastItem);
    });
}

// Allow "Enter" key to trigger search
cityInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchBtn.click();
});

// Theme Toggle Logic
const themeToggle = document.getElementById('theme-toggle');
const currentTheme = localStorage.getItem('theme') || 'light';

if (currentTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    themeToggle.textContent = '☀️';
}

themeToggle.addEventListener('click', () => {
    let theme = document.documentElement.getAttribute('data-theme');
    if (theme === 'dark') {
        document.documentElement.removeAttribute('data-theme');
        themeToggle.textContent = '🌙';
        localStorage.setItem('theme', 'light');
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        themeToggle.textContent = '☀️';
        localStorage.setItem('theme', 'dark');
    }
});
