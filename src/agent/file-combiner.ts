import * as fs from 'fs';
import * as path from 'path';

interface FileInfo {
    path: string;
    isDirectory: boolean;
    size?: number;
    modifiedTime?: Date;
}

export class FileCombiner {
    /**
     * Combines TypeScript files from a directory into a single string
     * 
     * @param directory The directory to search for TypeScript files
     * @returns A string containing all combined TypeScript code
     */
    public static combineTypeScriptFiles(directory: string): string {
        let combinedContent = '';
        this.findAndCombineFiles(directory, '.ts', (filePath, content) => {
            combinedContent += `\n${'='.repeat(80)}\n`;
            combinedContent += `FILE: ${filePath}\n`;
            combinedContent += `${'='.repeat(80)}\n\n`;
            combinedContent += content;
            combinedContent += '\n\n';
        });
        
        return combinedContent;
    }
    
    /**
     * Saves combined TypeScript files to an output file
     * 
     * @param directory The directory to search for TypeScript files
     * @param outputFile The path to the output file
     */
    public static saveCombinedTypeScriptFiles(directory: string, outputFile: string): void {
        const combinedContent = this.combineTypeScriptFiles(directory);
        
        // Create output directory if it doesn't exist
        const outputDir = path.dirname(outputFile);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        fs.writeFileSync(outputFile, combinedContent, 'utf8');
    }
    
    /**
     * Lists all files in a directory and its subdirectories
     * 
     * @param directory The directory to list files from
     * @param fileType Optional file extension filter (e.g., '.ts')
     * @returns An array of file information objects
     */
    public static listAllFiles(directory: string, fileType?: string): FileInfo[] {
        const fileList: FileInfo[] = [];
        
        try {
            this.traverseDirectory(directory, (filePath, isDirectory) => {
                // If fileType is specified, only include matching files
                if (fileType && !isDirectory && path.extname(filePath) !== fileType) {
                    return;
                }
                
                const stats = fs.statSync(filePath);
                fileList.push({
                    path: filePath,
                    isDirectory,
                    size: isDirectory ? undefined : stats.size,
                    modifiedTime: stats.mtime
                });
            });
        } catch (error) {
            console.error(`Error listing files in ${directory}:`, error);
        }
        
        return fileList;
    }
    
    /**
     * Gets the content of a specific file
     * 
     * @param filePath The path to the file
     * @returns The content of the file as a string, or null if file doesn't exist
     */
    public static getFileContent(filePath: string): string | null {
        try {
            if (!fs.existsSync(filePath)) {
                return null;
            }
            
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
                return null; // Cannot get content of a directory
            }
            
            return fs.readFileSync(filePath, 'utf8');
        } catch (error) {
            console.error(`Error reading file ${filePath}:`, error);
            return null;
        }
    }
    
    /**
     * Traverses a directory recursively and calls a callback for each file/directory
     * 
     * @param directory The directory to traverse
     * @param callback Function to call for each file/directory
     */
    private static traverseDirectory(directory: string, callback: (filePath: string, isDirectory: boolean) => void): void {
        try {
            const items = fs.readdirSync(directory);
            
            for (const item of items) {
                const itemPath = path.join(directory, item);
                const stat = fs.statSync(itemPath);
                const isDirectory = stat.isDirectory();
                
                // Call the callback with the current file/directory
                callback(itemPath, isDirectory);
                
                // Recursively traverse subdirectories
                if (isDirectory) {
                    this.traverseDirectory(itemPath, callback);
                }
            }
        } catch (error) {
            console.error(`Error traversing directory ${directory}:`, error);
        }
    }
    
    /**
     * Recursively finds and processes files
     * 
     * @param dir Directory to search
     * @param fileType File extension to look for
     * @param processFile Callback function to process each file
     */
    private static findAndCombineFiles(dir: string, fileType: string, processFile: (filePath: string, content: string) => void): void {
        try {
            const files = fs.readdirSync(dir);
            
            for (const file of files) {
                const filePath = path.join(dir, file);
                const stat = fs.statSync(filePath);
                
                if (stat.isDirectory()) {
                    // Recursively search subdirectories
                    this.findAndCombineFiles(filePath, fileType, processFile);
                } else if (path.extname(file) === fileType) {
                    // Found a file with the matching extension
                    const content = fs.readFileSync(filePath, 'utf8');
                    processFile(filePath, content);
                }
            }
        } catch (error) {
            console.error(`Error processing directory ${dir}:`, error);
        }
    }
}