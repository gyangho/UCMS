// getHolidays.js
const axios = require("axios");

async function getHolidays(year) {
  const url = `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?serviceKey=${process.env.HOLIDAY_API_KEY}&solYear=${year}&numOfRows=100`;
  const params = {};
  try {
    const response = await axios.get(url, { params });
    return response.data.response.body.items.item;
  } catch (error) {
    console.error(
      "Error fetching holidays:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
}

module.exports = { getHolidays };
