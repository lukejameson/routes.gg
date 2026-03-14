const fs = require('fs').promises;

async function extractTextManually() {
    // Since you already have the PDF loaded in Claude, 
    // I can see the text content. Let's create a simple extractor.
    
    const pdfParse = require('pdf-parse');
    const dataBuffer = await fs.readFile('./Guernsey-timetables-combined.pdf');
    
    try {
        const data = await pdfParse(dataBuffer);
        await fs.writeFile('timetable_raw_text.txt', data.text);
        console.log('✓ Extracted text to timetable_raw_text.txt');
        console.log(`Pages: ${data.numpages}`);
        console.log(`Characters: ${data.text.length}`);
    } catch (error) {
        console.error('Error:', error);
    }
}

extractTextManually();
