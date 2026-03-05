const axios = require('axios');

async function testBackend() {
    try {
        // Login to get token
        const loginRes = await axios.post('http://localhost:4000/auth/login', {
            email: 'admin@clinic.com',
            password: 'admin'
        });
        const token = loginRes.data.token;

        // Fetch stats
        const statsRes = await axios.get('http://localhost:4000/dashboard/stats', {
            headers: { Authorization: `Bearer ${token}` }
        });

        console.log("Dashboard Stats Response:");
        console.log(JSON.stringify(statsRes.data, null, 2));
    } catch (err) {
        console.error("Test failed:", err.message);
        if (err.response) {
            console.error("Response data:", err.response.data);
        }
    }
}

testBackend();
