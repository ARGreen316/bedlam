const fs = require('fs');
const readline = require('readline');
const path = require('path');

const INPUT_FILE = path.join(__dirname, 'BedlamCubeSolutions.txt');
const OUTPUT_FILE = path.join(__dirname, 'bedlam_solutions.bin');

async function processSolutions() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Error: Could not find ${INPUT_FILE} in current directory.`);
    process.exit(1);
  }

  console.log('Reading solutions and packing binary...');
  const fileStream = fs.createReadStream(INPUT_FILE, { encoding: 'utf8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const writeStream = fs.createWriteStream(OUTPUT_FILE);

  let solutionCount = 0;
  let currentBlockLines = [];
  let isCapturing = false;

  for await (const line of rl) {
    if (line.startsWith('Solution ')) {
      if (currentBlockLines.length === 4) {
        writePackedSolution(currentBlockLines, writeStream);
        solutionCount++;
      }
      currentBlockLines = [];
      isCapturing = true;
      continue;
    }

    if (isCapturing) {
      if (line.trim().length > 0) {
        currentBlockLines.push(line);
        if (currentBlockLines.length === 4) {
          writePackedSolution(currentBlockLines, writeStream);
          solutionCount++;
          currentBlockLines = [];
          isCapturing = false;
        }
      }
    }
  }

  // Flush trailing solution if file ends without extra headers
  if (currentBlockLines.length === 4) {
    writePackedSolution(currentBlockLines, writeStream);
    solutionCount++;
  }

  writeStream.end();

  writeStream.on('finish', () => {
    const stats = fs.statSync(OUTPUT_FILE);
    console.log(`\nDone!`);
    console.log(`Total Solutions Packed: ${solutionCount.toLocaleString()}`);
    console.log(`Output File: ${OUTPUT_FILE}`);
    console.log(`Output Size: ${(stats.size / 1024).toFixed(2)} KB (${stats.size.toLocaleString()} bytes)`);
  });
}

function writePackedSolution(lines, stream) {
  const cells = new Array(64);

  lines.forEach((line, rowIdx) => {
    const z = 3 - rowIdx;
    const slices = line.trim().split(/\s{2,}/);

    slices.forEach((sliceChunk, y) => {
      const tokens = sliceChunk.trim().split(/\s+/);
      tokens.forEach((token, x) => {
        const val = parseInt(token, 16); // Hex '0'-'C' to int 0-12
        const index = (y * 16) + (z * 4) + x;
        cells[index] = val;
      });
    });
  });

  // Pack 2 cells (4 bits each) into 1 byte (64 cells -> 32 bytes)
  const buffer = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) {
    const high = cells[i * 2] & 0x0F;
    const low = cells[i * 2 + 1] & 0x0F;
    buffer[i] = (high << 4) | low;
  }

  stream.write(buffer);
}

processSolutions();