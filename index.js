const express = require('express');
const mongoose = require('mongoose');
const app = express();

// Task A: Set up MongoDB connection using Mongoose
mongoose.connect('mongodb://mongodb/DailyFlow');

// Set schema
const daylogSchema = new mongoose.Schema({
    Date: String,
    Flow: String,
    Local: Number,
    Mainland: Number,
    Others: Number
},{versionKey: false});

// Create model from schema
const Daylog = mongoose.model('Daylog', daylogSchema, 'daylog');

// Monitor database connection
const db = mongoose.connection;
db.on("error", (err) => {
    console.log("MongoDB connection error: "+err);
  });
  db.on("connected", () => {
    console.log("Connected to MongoDB");
  });


const isValidDate = (year, month, day) => {
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && 
           date.getMonth() === month - 1 && 
           date.getDate() === day;
};

const formatDate = (year, month, day) => {
    return `${day}/${month}/${year}`;
};

// Task B: Route handler for retrieving passenger flow data
app.get('/HKPassenger/v1/data/:year/:month/:day', async (req, res) => {
    try {
        const { year, month, day } = req.params;
        let { num } = req.query;

        // Convert parameters to numbers
        const yearNum = parseInt(year);
        const monthNum = parseInt(month);
        const dayNum = parseInt(day);
        num = num ? parseInt(num) : 1;

        // Validate year
        if (yearNum < 2021 || yearNum > 2025) {
            return res.status(400).json({ 
                error: "Wrong year input - must be a number between 2021 - 2025." 
            });
        }

        // Validate month
        if (monthNum < 1 || monthNum > 12) {
            return res.status(400).json({ 
                error: "Wrong month input - must be a number between 1 - 12." 
            });
        }

        // Validate day
        if (dayNum < 1 || dayNum > 31) {
            return res.status(400).json({ 
                error: "Wrong date input - must be a number between 1 - 31." 
            });
        }

        // Validate if it's a real calendar date
        if (!isValidDate(yearNum, monthNum, dayNum)) {
            return res.status(400).json({ 
                error: `${dayNum}/${monthNum}/${yearNum} is not a valid calendar date!` 
            });
        }
        if (num < 1) {
            return res.status(400).json({ 
                error: "Wrong query string num - must be a number greater than zero" 
            });
        }

        const dbDateStrings = [];
        for (let i = 0; i < num; i++) {
            const currentDate = new Date(yearNum, monthNum - 1, dayNum + i);
            const dbFormattedDate = `${currentDate.getMonth() + 1}/${currentDate.getDate()}/${currentDate.getFullYear()}`;
            dbDateStrings.push(dbFormattedDate);
        }

        // Query using database date format
        const data = await Daylog.find(
            { Date: { $in: dbDateStrings } },
            { _id: 0 }
        ).sort({ Date: 1, Flow: 1 }).lean();

        // Convert to output format (d/m/yyyy)
        const result = data.map(record => {
            const [m, d, y] = record.Date.split('/');
            return {
                ...record,
                Date: `${d}/${m}/${y}`  // Convert to day/month/year
            };
        });

        // Ensure we have pairs of arrival/departure
        const finalResult = [];
        const dateMap = {};
        
        result.forEach(record => {
            if (!dateMap[record.Date]) {
                dateMap[record.Date] = [];
            }
            dateMap[record.Date].push(record);
        });

        // Sort by date and ensure arrival comes first
        Object.keys(dateMap).sort().forEach(date => {
            const records = dateMap[date];
            if (records.length === 2) {
                finalResult.push(
                    ...records.sort((a, b) => a.Flow === 'Arrival' ? -1 : 1)
                );
            }
        });

        res.json(finalResult);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: "Database error" });
    }
});

app.listen(8080, () => {
    console.log('AS54 App listening on port 8080!');
});