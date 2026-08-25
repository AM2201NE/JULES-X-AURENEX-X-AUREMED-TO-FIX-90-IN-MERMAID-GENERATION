export interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    modifiedTime?: string;
}

import { extractTextFromPdf } from './pdfService';

const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';

declare global {
    interface Window {
        gapi: any;
        google: any;
    }
}

export const googleDriveService = {
    loadScripts: (): Promise<void> => {
        return new Promise((resolve, reject) => {
            let gapiLoaded = false;
            let gsiLoaded = false;

            const checkDone = () => {
                if (gapiLoaded && gsiLoaded) {
                    window.gapi.load('picker', () => resolve());
                }
            };

            // Check GAPI
            if (window.gapi && window.gapi.load) {
                gapiLoaded = true;
            } else {
                const existingGapi = document.getElementById('gapi-script');
                if (existingGapi) {
                    existingGapi.addEventListener('load', () => { gapiLoaded = true; checkDone(); });
                } else {
                    const gapiScript = document.createElement('script');
                    gapiScript.id = 'gapi-script';
                    gapiScript.src = 'https://apis.google.com/js/api.js';
                    gapiScript.onload = () => { gapiLoaded = true; checkDone(); };
                    gapiScript.onerror = reject;
                    document.body.appendChild(gapiScript);
                }
            }

            // Check GSI
            if (window.google && window.google.accounts) {
                gsiLoaded = true;
            } else {
                const existingGsi = document.getElementById('gsi-script');
                if (existingGsi) {
                    existingGsi.addEventListener('load', () => { gsiLoaded = true; checkDone(); });
                } else {
                    const gsiScript = document.createElement('script');
                    gsiScript.id = 'gsi-script';
                    gsiScript.src = 'https://accounts.google.com/gsi/client';
                    gsiScript.onload = () => { gsiLoaded = true; checkDone(); };
                    gsiScript.onerror = reject;
                    document.body.appendChild(gsiScript);
                }
            }
            
            checkDone();
        });
    },

    authenticate: (clientId: string): Promise<string> => {
        return new Promise((resolve, reject) => {
            const tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: SCOPES,
                callback: async (response: any) => {
                    if (response.error !== undefined) {
                        reject(response);
                        return;
                    }
                    resolve(response.access_token);
                },
            });
            tokenClient.requestAccessToken({ prompt: 'consent' });
        });
    },

    getFiles: async (accessToken: string, folderId: string = 'root'): Promise<DriveFile[]> => {
        let query = `'${folderId}' in parents and trashed = false`;
        if (folderId === 'root') {
            query = `('${folderId}' in parents or sharedWithMe = true) and trashed = false`;
        }
        const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType)&orderBy=folder,name`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        if (!response.ok) {
            let errorMsg = response.statusText;
            try {
                const errorData = await response.json();
                if (errorData.error && errorData.error.message) {
                    errorMsg = errorData.error.message;
                }
            } catch (e) {}
            if (response.status === 401) {
                throw new Error(`Google Drive authentication expired. Please reconnect your account in Integrations.`);
            }
            throw new Error(`Failed to fetch files: ${errorMsg}`);
        }
        const data = await response.json();
        return data.files || [];
    },
    searchFiles: async (query: string, accessToken: string): Promise<any[]> => {
        // Use fullText search
        const q = `fullText contains '${query.replace(/'/g, "\\'")}' and trashed = false and mimeType != 'application/vnd.google-apps.folder'`;
        const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,parents)&pageSize=20`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        if (!response.ok) {
            console.error("Drive search failed", await response.text());
            return [];
        }
        const data = await response.json();
        return data.files || [];
    },
    getFileParents: async (fileId: string, accessToken: string): Promise<string[]> => {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        if (!response.ok) return [];
        const data = await response.json();
        return data.parents || [];
    },

    authenticateAndPickFiles: (clientId: string, apiKey: string, appId: string): Promise<{ accessToken: string, files: DriveFile[] }> => {
        return new Promise((resolve, reject) => {
            const tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: SCOPES,
                callback: async (response: any) => {
                    if (response.error !== undefined) {
                        reject(response);
                        return;
                    }
                    const accessToken = response.access_token;
                    
                    const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS);
                    view.setIncludeFolders(true);
                    
                    const picker = new window.google.picker.PickerBuilder()
                        .enableFeature(window.google.picker.Feature.NAV_HIDDEN)
                        .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
                        .setDeveloperKey(apiKey)
                        .setAppId(appId)
                        .setOAuthToken(accessToken)
                        .setOrigin(window.location.protocol + '//' + window.location.host)
                        .addView(view)
                        .setCallback((data: any) => {
                            if (data.action === window.google.picker.Action.PICKED) {
                                const files = data.docs.map((doc: any) => ({
                                    id: doc.id,
                                    name: doc.name,
                                    mimeType: doc.mimeType
                                }));
                                resolve({ accessToken, files });
                            } else if (data.action === window.google.picker.Action.CANCEL) {
                                reject(new Error('Picker canceled'));
                            }
                        })
                        .build();
                    picker.setVisible(true);
                },
            });
            tokenClient.requestAccessToken({ prompt: 'consent' });
        });
    },

    getFileSnippet: async (fileId: string, mimeType: string, accessToken: string): Promise<string> => {
        try {
            let url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
            let isExport = false;
            
            // Google Workspace documents need to be exported
            if (mimeType.includes('application/vnd.google-apps.document')) {
                url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
                isExport = true;
            } else if (mimeType.includes('application/vnd.google-apps.spreadsheet')) {
                url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`;
                isExport = true;
            } else if (mimeType.includes('application/vnd.google-apps.presentation')) {
                url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
                isExport = true;
            } else if (mimeType.includes('application/vnd.google-apps')) {
                return `[Content extraction not supported for this Google Workspace type: ${mimeType}]`;
            }

            if (mimeType.startsWith('image/')) {
                return `[Image: https://www.googleapis.com/drive/v3/files/${fileId}?alt=media]`;
            }

            const headers: Record<string, string> = {
                'Authorization': `Bearer ${accessToken}`
            };

            // Limit the download to the first 10KB to get a fast snippet
            if (!isExport) {
                headers['Range'] = 'bytes=0-10240';
            }

            const response = await fetch(url, { headers });

            if (!response.ok && response.status !== 206) {
                return `[Failed to fetch snippet]`;
            }

            let text = await response.text();
            
            // If it's an export, we couldn't use Range, so we truncate here
            if (isExport && text.length > 5000) {
                text = text.substring(0, 5000);
            }
            
            return text;
        } catch (error) {
            console.error('Error fetching file snippet:', error);
            return `[Error fetching snippet]`;
        }
    },

    getFileContent: async (fileId: string, mimeType: string, accessToken: string): Promise<string> => {
        try {
            let url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
            let isExport = false;
            
            // Google Workspace documents need to be exported
            if (mimeType.includes('application/vnd.google-apps.document')) {
                url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/html`;
                isExport = true;
            } else if (mimeType.includes('application/vnd.google-apps.spreadsheet')) {
                url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`;
                isExport = true;
            } else if (mimeType.includes('application/vnd.google-apps.presentation')) {
                url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
                isExport = true;
            } else if (mimeType.includes('application/vnd.google-apps')) {
                return `[Content extraction not supported for this Google Workspace type: ${mimeType}]`;
            }

            if (mimeType.startsWith('image/')) {
                return `[Image: https://www.googleapis.com/drive/v3/files/${fileId}?alt=media]`;
            }

            const headers: Record<string, string> = {
                'Authorization': `Bearer ${accessToken}`
            };

            // For non-Workspace files, limit the download to the first 5MB to prevent browser crashes
            // from massive files ("billions of lines")
            if (!isExport) {
                headers['Range'] = 'bytes=0-5242880';
            }

            const response = await fetch(url, { headers });

            if (!response.ok && response.status !== 206) { // 206 Partial Content is expected with Range header
                let errorMsg = response.statusText;
                try {
                    const errorData = await response.json();
                    if (errorData.error && errorData.error.message) {
                        errorMsg = errorData.error.message;
                    }
                } catch (e) {}
                
                if (response.status === 401) {
                    throw new Error(`Google Drive authentication expired. Please reconnect your account in Integrations.`);
                }
                
                if (response.status === 403 && errorMsg.includes('too large')) {
                    console.warn(`File ${fileId} is too large to be exported via Drive API. Attempting fallbacks...`);
                    
                    if (mimeType.includes('application/vnd.google-apps.document')) {
                        // Fallback 1: Try Google Docs API (requires Docs API to be enabled in GCP)
                        // This preserves images and formatting
                        try {
                            const docsResponse = await fetch(`https://docs.googleapis.com/v1/documents/${fileId}`, {
                                headers: { 'Authorization': `Bearer ${accessToken}` }
                            });
                            
                            if (docsResponse.ok) {
                                const docData = await docsResponse.json();
                                let html = '<div class="p-8 bg-white dark:bg-gray-900 text-black dark:text-white rounded-lg">';
                                html += `<p class="text-sm text-gray-500 mb-4"><em>Note: This large document was loaded via the Google Docs API.</em></p>`;
                                
                                if (docData.body && docData.body.content) {
                                    for (const element of docData.body.content) {
                                        if (element.paragraph && element.paragraph.elements) {
                                            let pStyle = 'margin-bottom: 1em;';
                                            const align = element.paragraph.paragraphStyle?.alignment;
                                            if (align === 'CENTER') pStyle += 'text-align: center;';
                                            else if (align === 'END') pStyle += 'text-align: right;';
                                            else if (align === 'JUSTIFIED') pStyle += 'text-align: justify;';

                                            html += `<p style="${pStyle}">`;
                                            for (const pElement of element.paragraph.elements) {
                                                if (pElement.textRun && pElement.textRun.content) {
                                                    let text = pElement.textRun.content
                                                        .replace(/&/g, '&amp;')
                                                        .replace(/</g, '&lt;')
                                                        .replace(/>/g, '&gt;')
                                                        .replace(/\n/g, '<br/>');
                                                    
                                                    let style = '';
                                                    const textStyle = pElement.textRun.textStyle;
                                                    if (textStyle) {
                                                        if (textStyle.bold) style += 'font-weight: bold;';
                                                        if (textStyle.italic) style += 'font-style: italic;';
                                                        if (textStyle.underline) style += 'text-decoration: underline;';
                                                        if (textStyle.strikethrough) style += 'text-decoration: line-through;';
                                                        if (textStyle.foregroundColor?.color?.rgbColor) {
                                                            const rgb = textStyle.foregroundColor.color.rgbColor;
                                                            style += `color: rgb(${Math.round((rgb.red||0)*255)}, ${Math.round((rgb.green||0)*255)}, ${Math.round((rgb.blue||0)*255)});`;
                                                        }
                                                        if (textStyle.backgroundColor?.color?.rgbColor) {
                                                            const rgb = textStyle.backgroundColor.color.rgbColor;
                                                            // Use rgba out of RGB with 0.4 opacity for readability
                                                            style += `background-color: rgba(${Math.round((rgb.red||0)*255)}, ${Math.round((rgb.green||0)*255)}, ${Math.round((rgb.blue||0)*255)}, 0.4);`;
                                                        }
                                                        if (textStyle.fontSize?.magnitude) {
                                                            style += `font-size: ${textStyle.fontSize.magnitude}pt;`;
                                                        }
                                                    }
                                                    if (style) {
                                                        html += `<span style="${style}">${text}</span>`;
                                                    } else {
                                                        html += text;
                                                    }
                                                } else if (pElement.inlineObjectElement) {
                                                    const objectId = pElement.inlineObjectElement.inlineObjectId;
                                                    const inlineObject = docData.inlineObjects?.[objectId];
                                                    if (inlineObject?.inlineObjectProperties?.embeddedObject?.imageProperties?.contentUri) {
                                                        const imgUri = inlineObject.inlineObjectProperties.embeddedObject.imageProperties.contentUri;
                                                        html += `<img src="${imgUri}" style="max-width: 100%; height: auto; display: inline-block; margin: 0.5em 0;" referrerPolicy="no-referrer" />`;
                                                    }
                                                }
                                            }
                                            html += '</p>';
                                        } else if (element.table) {
                                            html += '<table style="width: 100%; border-collapse: collapse; margin-bottom: 1em;">';
                                            for (const row of element.table.tableRows || []) {
                                                html += '<tr>';
                                                for (const cell of row.tableCells || []) {
                                                    html += '<td style="border: 1px solid #ccc; padding: 0.5em;">';
                                                    for (const cellContent of cell.content || []) {
                                                        if (cellContent.paragraph && cellContent.paragraph.elements) {
                                                            html += '<p style="margin: 0;">';
                                                            for (const pElement of cellContent.paragraph.elements) {
                                                                if (pElement.textRun && pElement.textRun.content) {
                                                                    html += pElement.textRun.content.replace(/\n/g, '<br/>');
                                                                }
                                                            }
                                                            html += '</p>';
                                                        }
                                                    }
                                                    html += '</td>';
                                                }
                                                html += '</tr>';
                                            }
                                            html += '</table>';
                                        }
                                    }
                                }
                                html += '</div>';
                                return html;
                            } else {
                                const errData = await docsResponse.json();
                                console.warn("Docs API fallback failed (likely not enabled):", errData);
                            }
                        } catch (fallbackErr) {
                            console.error("Docs API fallback failed:", fallbackErr);
                        }

                        // Fallback 2: Try exporting as plain text (strips images/formatting, much smaller file size)
                        try {
                            const plainTextUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
                            const plainTextResponse = await fetch(plainTextUrl, {
                                headers: { 'Authorization': `Bearer ${accessToken}` }
                            });
                            if (plainTextResponse.ok) {
                                const text = await plainTextResponse.text();
                                return `<div class="p-4"><p><em>Note: This large document was loaded as plain text because the formatted version was too large.</em></p><pre class="whitespace-pre-wrap font-sans">${text}</pre></div>`;
                            }
                        } catch (e) {
                            console.error("Plain text export fallback failed:", e);
                        }
                    } else if (mimeType.includes('application/vnd.google-apps.spreadsheet')) {
                        try {
                            const sheetsResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${fileId}?includeGridData=true`, {
                                headers: { 'Authorization': `Bearer ${accessToken}` }
                            });
                            
                            if (sheetsResponse.ok) {
                                const sheetData = await sheetsResponse.json();
                                let text = '';
                                if (sheetData.sheets) {
                                    for (const sheet of sheetData.sheets) {
                                        text += `--- Sheet: ${sheet.properties?.title || 'Unknown'} ---\n`;
                                        if (sheet.data) {
                                            for (const gridData of sheet.data) {
                                                if (gridData.rowData) {
                                                    for (const row of gridData.rowData) {
                                                        const rowValues = [];
                                                        if (row.values) {
                                                            for (const cell of row.values) {
                                                                rowValues.push(cell.formattedValue || cell.userEnteredValue?.stringValue || cell.userEnteredValue?.numberValue || '');
                                                            }
                                                        }
                                                        text += rowValues.join(', ') + '\n';
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                return text;
                            }
                        } catch (fallbackErr) {
                            console.error("Sheets API fallback failed:", fallbackErr);
                        }
                    } else if (mimeType.includes('application/vnd.google-apps.presentation')) {
                        try {
                            const slidesResponse = await fetch(`https://slides.googleapis.com/v1/presentations/${fileId}`, {
                                headers: { 'Authorization': `Bearer ${accessToken}` }
                            });
                            
                            if (slidesResponse.ok) {
                                const presentationData = await slidesResponse.json();
                                let text = '';
                                if (presentationData.slides) {
                                    for (let i = 0; i < presentationData.slides.length; i++) {
                                        const slide = presentationData.slides[i];
                                        text += `\n--- Slide ${i + 1} ---\n`;
                                        if (slide.pageElements) {
                                            for (const element of slide.pageElements) {
                                                if (element.shape && element.shape.text && element.shape.text.textElements) {
                                                    for (const textElement of element.shape.text.textElements) {
                                                        if (textElement.textRun && textElement.textRun.content) {
                                                            text += textElement.textRun.content;
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                return text;
                            }
                        } catch (fallbackErr) {
                            console.error("Slides API fallback failed:", fallbackErr);
                        }
                    }
                    
                    return `[Content extraction failed: File is too large to be exported via Google Drive API]`;
                }

                if (response.status === 416) {
                    // Range Not Satisfiable - might happen if file is empty
                    return "";
                }

                console.warn(`Failed to fetch file content for ${fileId}: ${errorMsg}`);
                return `[Content extraction failed: ${errorMsg}]`;
            }

            if (mimeType === 'application/pdf') {
                const arrayBuffer = await response.arrayBuffer();
                return await extractTextFromPdf(arrayBuffer);
            }

            let content = await response.text();
            
            // If it's HTML (from Google Docs export), we can do some basic parsing to preserve image tags for RAG
            // but we should return the full HTML so the viewer can render it properly with tables, formatting, etc.
            if (mimeType.includes('application/vnd.google-apps.document')) {
                // We will return the raw HTML. The RAG system will need to strip HTML tags when chunking.
                return content;
            }

            if (response.status === 206) {
                content += "\n\n[...Content truncated due to file size limits. Use 'Open in Drive' to view the full file...]";
            }

            return content;
        } catch (error) {
            console.error('Error fetching Drive file content:', error);
            return '';
        }
    }
};
