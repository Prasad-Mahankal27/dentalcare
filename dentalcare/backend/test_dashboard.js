const axios = require('axios');

async function test() {
    try {
        console.log("Logging in...");
        const loginRes = await axios.post('http://localhost:4000/auth/login', {
            phone: "9000000001",
            password: "password123"
        });

        const token = loginRes.data.token;
        console.log("Logged in! Token found.");

        console.log("Fetching dashboard stats...");
        const statsRes = await axios.get('http://localhost:4000/dashboard/stats', {
            headers: { Authorization: `Bearer ${token}` }
        });

        console.log("--- Dashboard Stats ---");
        console.log(JSON.stringify(statsRes.data, null, 2));

    } catch (err) {
        console.error("Test failed:", err.response ? err.response.data : err.message);
    }
}

test();
