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

//Validation of the data
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
function getDatesInMonth(year, month) {
    const dates = [];
    const daysInMonth = new Date(year, month + 1, 0).getDate(); // Get last day of month

    for (let day = 1; day <= daysInMonth; day++) {
        // Format as "m/d/yyyy" to match your database format
        dates.push(`${month + 1}/${day}/${year}`);
    }
    return dates;
}

app.get('/HKPassenger/v1/aggregate/:group/:year/:month', async (req, res) => {
    const { group, year, month } = req.params;
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    
    // Validate group
    if (!['local', 'mainland', 'others', 'all'].includes(group.toLowerCase())) {
        return res.status(400).json({ error: `Cannot GET /HKPassenger/v1/aggregate/${group}/${year}/${month}` });
    }
    
    // Validate year
    if (yearNum < 2021 || yearNum > 2025 || monthNum < 1 || monthNum > 12) {
        return res.status(400).json({ error: `Cannot GET /HKPassenger/v1/aggregate/${group}/${year}/${month}` });
    }
  
    try {
        const dates = getDatesInMonth(yearNum, monthNum - 1);
        
        const data = await Daylog.find(
            { Date: { $in: dates } },
            { _id: 0 }
        ).sort({ Date: 1, Flow: 1 }).lean();

        // Process daily aggregation
        const dailyAggregation = {};
        
        data.forEach(entry => {
            if (!dailyAggregation[entry.Date]) {
                dailyAggregation[entry.Date] = {
                    Date: entry.Date,
                    Local: 0,
                    Mainland: 0,
                    Others: 0
                };
            }
            
            if (entry.Flow === 'Arrival') {
                dailyAggregation[entry.Date].Local += entry.Local;
                dailyAggregation[entry.Date].Mainland += entry.Mainland;
                dailyAggregation[entry.Date].Others += entry.Others;
            } else {
                dailyAggregation[entry.Date].Local -= entry.Local;
                dailyAggregation[entry.Date].Mainland -= entry.Mainland;
                dailyAggregation[entry.Date].Others -= entry.Others;
            }
        });

        // Format the response
        const result = Object.values(dailyAggregation).map(day => {
            const response = { Date: day.Date };
            
            if (group === 'all') {
                response.Local = day.Local;
                response.Mainland = day.Mainland;
                response.Others = day.Others;
                response.Total = day.Local + day.Mainland + day.Others;
            } else {
                const capitalizedGroup = group.charAt(0).toUpperCase() + group.slice(1);
                response[capitalizedGroup] = day[capitalizedGroup];
            }
            
            return response;
        })
        .sort((a, b) => new Date(a.Date) - new Date(b.Date));

        return res.json(result);
    } catch (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: "Experiencing database error!!" });
    }
});

// Year
app.get('/HKPassenger/v1/aggregate/:group/:year', async (req, res) => {
    const { group, year } = req.params;
    const yearNum = parseInt(year);
    
    // Validate group
    if (!['local', 'mainland', 'others', 'all'].includes(group.toLowerCase())) {
        return res.status(400).json({ error: `Cannot GET /HKPassenger/v1/aggregate/${group}/${year}` });
    }
    
    // Validate year
    if (yearNum < 2021 || yearNum > 2025) {
        return res.status(400).json({ error: `Cannot GET /HKPassenger/v1/aggregate/${group}/${year}` });
    }
  
    try {
        // Get all data for the specified year
        const yearPattern = new RegExp(`\\d+/\\d+/${yearNum}$`);
        const data = await Daylog.find(
            { Date: yearPattern },
            { _id: 0 }
        ).sort({ Date: 1, Flow: 1 }).lean();

        // Process monthly aggregation
        const monthlyAggregation = {};
        
        data.forEach(entry => {
            const [m, d, y] = entry.Date.split('/');
            
            const monthKey = `${m.padStart(2, '0')}/${y}`;
            
            if (!monthlyAggregation[monthKey]) {
                monthlyAggregation[monthKey] = {
                    Month: `${parseInt(m)}/${y}`, // Store without padding for display
                    Local: 0,
                    Mainland: 0,
                    Others: 0,
                    // Add sortKey for proper ordering
                    sortKey: new Date(`${y}-${m.padStart(2, '0')}-01`)
                };
            }
            
            if (entry.Flow === 'Arrival') {
                monthlyAggregation[monthKey].Local += entry.Local;
                monthlyAggregation[monthKey].Mainland += entry.Mainland;
                monthlyAggregation[monthKey].Others += entry.Others;
            } else {
                monthlyAggregation[monthKey].Local -= entry.Local;
                monthlyAggregation[monthKey].Mainland -= entry.Mainland;
                monthlyAggregation[monthKey].Others -= entry.Others;
            }
        });

        // Format the response and sort by month
        const result = Object.values(monthlyAggregation)
            .sort((a, b) => a.sortKey - b.sortKey)
            .map(month => {
                const response = { Month: month.Month };
                
                if (group === 'all') {
                    response.Local = month.Local;
                    response.Mainland = month.Mainland;
                    response.Others = month.Others;
                    response.Total = month.Local + month.Mainland + month.Others;
                } else {
                    const capitalizedGroup = group.charAt(0).toUpperCase() + group.slice(1);
                    response[capitalizedGroup] = month[capitalizedGroup];
                }
                
                return response;
            });

        return res.json(result);
    } catch (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: "Experiencing database error!!" });
    }
});

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

app.use((req, res) => {
    res.status(400).json({
      error: `Cannot ${req.method} ${req.path || '[invalid path]'}`
    });
});

app.listen(8080, () => {
    console.log('AS54 App listening on port 8080!');
});