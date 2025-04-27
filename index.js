const express = require('express');
const mongoose = require('mongoose');
const app = express();
app.use(express.json());
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

// Task B
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


//Task C


//Task D
app.post('/HKPassenger/v1/data/', async (req, res) => {
    if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ error: "POST request - missing data." });
    }

    const dates = req.body;
    const status = {};

    try {
        for (const [dateStr, entries] of Object.entries(dates)) {
            // Validate date format and validity
            const dateParts = dateStr.split('/');
            if (dateParts.length !== 3) {
                status[dateStr] = "Wrong date format or invalid date";
                continue;
            }

            const month = parseInt(dateParts[0], 10);
            const day = parseInt(dateParts[1], 10);
            const year = parseInt(dateParts[2], 10);

            if (isNaN(month) || isNaN(day) || isNaN(year)) {
                status[dateStr] = "Wrong date format or invalid date";
                continue;
            }

            // Check if the date is a valid calendar date
            const parsedDate = new Date(year, month - 1, day);
            if (parsedDate.getMonth() + 1 !== month || parsedDate.getDate() !== day || parsedDate.getFullYear() !== year) {
                status[dateStr] = "Wrong date format or invalid date";
                continue;
            }

            // Check if date exists in the database
            const existing = await Daylog.findOne({ Date: dateStr });
            if (existing) {
                status[dateStr] = "Records existed; cannot override";
                continue;
            }

            // Insert new records
            const docs = entries.map(entry => ({
                Date: dateStr,
                Flow: entry.Flow,
                Local: entry.Local,
                Mainland: entry.Mainland,
                Others: entry.Others
            }));

            await Daylog.insertMany(docs);
            status[dateStr] = "Added two records to the database";
        }

        res.json({ status });
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: "Experiencing database error!!" });
    }
});

app.listen(8080, () => {
    console.log('AS54 App listening on port 8080!');
});