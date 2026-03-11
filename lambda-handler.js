const WeddingAPIServer = require('./api-server');

// Lambda handler for serverless deployment
exports.handler = async (event, context) => {
    // Set Lambda context to not wait for empty event loop
    context.callbackWaitsForEmptyEventLoop = false;
    
    try {
        // Check if this is a request for the admin UI
        if (event.path === '/admin' || event.path === '/admin/' || event.path === '/admin-ui') {
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'text/html',
                    'Cache-Control': 'no-cache'
                },
                body: `<!DOCTYPE html>
<html>
<head>
    <title>Wedding Admin</title>
    <style>
        body { font-family: Arial; padding: 20px; background: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
        .form-group { margin: 15px 0; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        input, select { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
        .btn { padding: 10px 15px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; margin: 5px 0; }
        .btn:hover { background: #0056b3; }
        .hidden { display: none; }
        .message { padding: 10px; margin: 10px 0; border-radius: 4px; }
        .success { background: #d4edda; color: #155724; }
        .error { background: #f8d7da; color: #721c24; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; overflow-x: auto; display: block; }
        thead, tbody { display: table; width: 100%; table-layout: fixed; }
        th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f8f9fa; font-weight: bold; cursor: pointer; user-select: none; position: relative; }
        th:hover { background: #e9ecef; }
        th .sort-arrow { margin-left: 5px; font-size: 10px; opacity: 0.5; }
        th.sorted .sort-arrow { opacity: 1; }
        @media (max-width: 768px) {
            table { font-size: 12px; }
            th, td { padding: 6px 4px; }
            .action-btn { padding: 3px 6px; font-size: 11px; display: block; margin: 2px 0; }
        }
        .action-btn { padding: 4px 8px; margin: 0 2px; border: none; border-radius: 3px; cursor: pointer; font-size: 12px; }
        .delete-btn { background: #dc3545; color: white; }
        .resend-btn { background: #28a745; color: white; }
        .modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; }
        .modal.hidden { display: none; }
        .modal-content { background: white; padding: 20px; border-radius: 8px; max-width: 400px; width: 90%; text-align: center; }
        .modal-buttons { margin-top: 15px; }
        .modal-buttons button { margin: 0 5px; }
        .search-box { margin: 15px 0; }
        .search-box input { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; }
        .search-box input:focus { outline: none; border-color: #007bff; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Wedding Admin Panel</h1>
        
        <div id="login">
            <h3>Login</h3>
            <div class="form-group">
                <label>Password:</label>
                <input type="password" id="password" placeholder="Enter password">
            </div>
            <button class="btn" id="loginBtn">Login</button>
            <div id="loginMsg"></div>
        </div>

        <div id="admin" class="hidden">
            <h3>Add Guest</h3>
            <div class="form-group">
                <label>Name:</label>
                <input type="text" id="name" placeholder="Guest name">
            </div>
            <div class="form-group">
                <label>Email:</label>
                <input type="email" id="email" placeholder="Email">
            </div>
            <div class="form-group">
                <label>Phone:</label>
                <input type="tel" id="phone" placeholder="Phone">
            </div>
            <div class="form-group">
                <label>Max Guests:</label>
                <input type="number" id="maxGuests" placeholder="2" min="0" max="10" value="2">
                <small style="color: #666;">Set to 0 if guest doesn't need to RSVP</small>
            </div>
            <div class="form-group">
                <label>Event Access:</label>
                <div style="display: flex; gap: 15px; margin-top: 5px;">
                    <label style="display: flex; align-items: center; gap: 5px; font-weight: normal;">
                        <input type="checkbox" id="eventHaldi" value="haldi">
                        Haldi
                    </label>
                    <label style="display: flex; align-items: center; gap: 5px; font-weight: normal;">
                        <input type="checkbox" id="eventSangeet" value="sangeet">
                        Sangeet
                    </label>
                    <label style="display: flex; align-items: center; gap: 5px; font-weight: normal;">
                        <input type="checkbox" id="eventWedding" value="wedding" checked>
                        Wedding
                    </label>
                </div>
            </div>
            <button class="btn" id="addGuestBtn">Add Guest</button>
            
            <h3>Bulk Upload</h3>
            <div class="form-group">
                <label>Excel File (.xlsx or .xls):</label>
                <input type="file" id="excelFile" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel">
                <small>Columns: Name, Email, Phone, MaxGuests, EventAccess, GuestSide</small>
            </div>
            <div id="preview"></div>
            <button class="btn" id="uploadBtn" disabled>Upload</button>
            
            <button class="btn" id="loadGuestsBtn">Load Guests</button>
            <button class="btn" id="logoutBtn" style="background: #dc3545;">Logout</button>
            <div id="msg"></div>
            <div id="guests"></div>
        </div>
        
        <!-- Delete Confirmation Modal -->
        <div id="deleteModal" class="modal hidden">
            <div class="modal-content">
                <h3>Confirm Delete</h3>
                <p id="deleteMessage"></p>
                <div class="modal-buttons">
                    <button class="btn" id="confirmDeleteBtn" style="background: #dc3545;">Delete</button>
                    <button class="btn" id="cancelDeleteBtn">Cancel</button>
                </div>
            </div>
        </div>
    </div>

    <script>
        const API = "https://your-api-gateway-url.execute-api.region.amazonaws.com/prod";
        const PASS = "admin";
        let auth = false;
        let excelData = null;
        let deleteToken = null;
        let guestsData = [];
        let sortColumn = null;
        let sortDirection = 'asc';
        let searchQuery = '';

        // Login function
        function doLogin() {
            const pass = document.getElementById('password').value;
            if (pass === PASS) {
                document.getElementById('login').classList.add('hidden');
                document.getElementById('admin').classList.remove('hidden');
                auth = true;
                showMsg('loginMsg', 'Login successful!', 'success');
            } else {
                showMsg('loginMsg', 'Invalid password', 'error');
            }
        }

        // Logout function
        function logout() {
            document.getElementById('admin').classList.add('hidden');
            document.getElementById('login').classList.remove('hidden');
            document.getElementById('password').value = '';
            auth = false;
        }

        // Add guest function
        async function addGuest() {
            if (!auth) return;
            
            // Get selected events
            const eventAccess = [];
            if (document.getElementById('eventHaldi').checked) eventAccess.push('haldi');
            if (document.getElementById('eventSangeet').checked) eventAccess.push('sangeet');
            if (document.getElementById('eventWedding').checked) eventAccess.push('wedding');
            
            const data = {
                accessCode: generateCode(),
                name: document.getElementById('name').value,
                email: document.getElementById('email').value,
                phone: document.getElementById('phone').value,
                maxGuests: parseInt(document.getElementById('maxGuests').value) >= 0 ? parseInt(document.getElementById('maxGuests').value) : 2,
                eventAccess: eventAccess,
                sendInvitations: true
            };
            if (!data.name || eventAccess.length === 0) {
                showMsg('msg', 'Name and at least one event required', 'error');
                return;
            }
            try {
                const res = await fetch(API + '/admin/guests', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + PASS },
                    body: JSON.stringify(data)
                });
                const result = await res.json();
                if (res.ok && result.success) {
                    showMsg('msg', 'Guest added! Code: ' + data.accessCode, 'success');
                    document.getElementById('name').value = '';
                    document.getElementById('email').value = '';
                    document.getElementById('phone').value = '';
                    document.getElementById('maxGuests').value = '2';
                    document.getElementById('eventHaldi').checked = false;
                    document.getElementById('eventSangeet').checked = false;
                    document.getElementById('eventWedding').checked = true;
                } else {
                    showMsg('msg', 'Error: ' + (result.error || 'Failed'), 'error');
                }
            } catch (e) {
                showMsg('msg', 'Network error: ' + e.message, 'error');
            }
        }

        // Preview Excel function
        function previewExcel() {
            const file = document.getElementById('excelFile').files[0];
            if (!file) {
                document.getElementById('preview').innerHTML = '';
                document.getElementById('uploadBtn').disabled = true;
                excelData = null;
                return;
            }
            const reader = new FileReader();
            reader.onload = function(e) {
                const data = new Uint8Array(e.target.result);
                excelData = btoa(String.fromCharCode.apply(null, data));
                document.getElementById('preview').innerHTML = '<p>✅ File loaded: ' + file.name + '</p>';
                document.getElementById('uploadBtn').disabled = false;
            };
            reader.readAsArrayBuffer(file);
        }

        // Upload Excel function
        async function uploadExcel() {
            if (!auth || !excelData) return;
            try {
                showMsg('msg', 'Uploading...', 'success');
                const res = await fetch(API + '/admin/guests/bulk', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + PASS },
                    body: JSON.stringify({ fileData: excelData })
                });
                const result = await res.json();
                if (res.ok && result.success) {
                    showMsg('msg', result.message + (result.errors ? ' (Errors: ' + result.errors.length + ')' : ''), 'success');
                    document.getElementById('excelFile').value = '';
                    document.getElementById('preview').innerHTML = '';
                    document.getElementById('uploadBtn').disabled = true;
                    excelData = null;
                } else {
                    showMsg('msg', 'Error: ' + (result.error || 'Failed'), 'error');
                }
            } catch (e) {
                showMsg('msg', 'Network error: ' + e.message, 'error');
            }
        }

        // Load guests function
        async function loadGuests() {
            if (!auth) return;
            try {
                const res = await fetch(API + '/admin/guests', {
                    headers: { 'Authorization': 'Bearer ' + PASS }
                });
                if (res.ok) {
                    const result = await res.json();
                    guestsData = result.guests || [];
                    renderGuestsTable();
                }
            } catch (e) {
                showMsg('msg', 'Error loading guests: ' + e.message, 'error');
            }
        }

        // Delete guest function
        function deleteGuest(token, name) {
            deleteToken = token;
            document.getElementById('deleteMessage').textContent = 'Are you sure you want to delete "' + name + '"? This will permanently remove them from the database.';
            document.getElementById('deleteModal').classList.remove('hidden');
        }

        // Close modal function
        function closeModal() {
            document.getElementById('deleteModal').classList.add('hidden');
            deleteToken = null;
        }

        // Confirm delete function
        async function confirmDelete() {
            if (!deleteToken) return;
            try {
                const res = await fetch(API + '/admin/guests/' + deleteToken, {
                    method: 'DELETE',
                    headers: { 'Authorization': 'Bearer ' + PASS }
                });
                if (res.ok) {
                    showMsg('msg', 'Guest deleted successfully', 'success');
                    closeModal();
                    loadGuests();
                } else {
                    showMsg('msg', 'Failed to delete guest', 'error');
                }
            } catch (e) {
                showMsg('msg', 'Network error: ' + e.message, 'error');
            }
        }

        // Resend invite function
        async function resendInvite(token) {
            try {
                showMsg('msg', 'Sending invitation...', 'success');
                const res = await fetch(API + '/admin/guests/' + token + '/resend', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + PASS }
                });
                const result = await res.json();
                if (res.ok && result.success) {
                    showMsg('msg', result.message || 'Invitation resent!', 'success');
                } else {
                    showMsg('msg', result.error || 'Failed to resend', 'error');
                }
            } catch (e) {
                showMsg('msg', 'Network error: ' + e.message, 'error');
            }
        }

        // Generate code function
        function generateCode() {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let result = '';
            for (let i = 0; i < 6; i++) {
                result += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return result;
        }

        // Show message function
        function showMsg(id, msg, type) {
            const el = document.getElementById(id);
            if (el) {
                el.innerHTML = '<div class="message ' + type + '">' + msg + '</div>';
                setTimeout(() => el.innerHTML = '', 5000);
            }
        }

        // Escape HTML function
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // Sort table function
        function sortTable(column) {
            if (sortColumn === column) {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortColumn = column;
                sortDirection = 'asc';
            }
            
            guestsData.sort((a, b) => {
                let valA, valB;
                
                switch(column) {
                    case 'name':
                        valA = (a.guest_name || '').toLowerCase();
                        valB = (b.guest_name || '').toLowerCase();
                        break;
                    case 'code':
                        valA = (a.token || '').toLowerCase();
                        valB = (b.token || '').toLowerCase();
                        break;
                    case 'maxGuests':
                        valA = a.max_guests || 0;
                        valB = b.max_guests || 0;
                        break;
                    case 'events':
                        valA = (a.event_access || []).join(',');
                        valB = (b.event_access || []).join(',');
                        break;
                    case 'email':
                        valA = (a.email || '').toLowerCase();
                        valB = (b.email || '').toLowerCase();
                        break;
                    default:
                        return 0;
                }
                
                if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
                if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
                return 0;
            });
            
            renderGuestsTable();
        }

        // Search guests
        function searchGuests(query) {
            searchQuery = query.toLowerCase();
            renderGuestsTable();
        }

        // Render guests table
        function renderGuestsTable() {
            const filteredGuests = guestsData.filter(g => {
                if (!searchQuery) return true;
                return (g.guest_name || '').toLowerCase().includes(searchQuery) ||
                       (g.token || '').toLowerCase().includes(searchQuery) ||
                       (g.email || '').toLowerCase().includes(searchQuery) ||
                       (g.event_access || []).join(',').toLowerCase().includes(searchQuery);
            });
            
            let html = '<h3>Guests (' + filteredGuests.length + (searchQuery ? ' of ' + guestsData.length : '') + ')</h3>';
            html += '<div class="search-box"><input type="text" id="searchInput" placeholder="Search by name, code, email, or events..." value="' + escapeHtml(searchQuery) + '" oninput="searchGuests(this.value)"></div>';
            if (filteredGuests.length > 0) {
                html += '<table><thead><tr>';
                html += '<th onclick="sortTable(\'name\')" class="' + (sortColumn === 'name' ? 'sorted' : '') + '">Name<span class="sort-arrow">' + (sortColumn === 'name' ? (sortDirection === 'asc' ? '▲' : '▼') : '⇅') + '</span></th>';
                html += '<th onclick="sortTable(\'code\')" class="' + (sortColumn === 'code' ? 'sorted' : '') + '">Code<span class="sort-arrow">' + (sortColumn === 'code' ? (sortDirection === 'asc' ? '▲' : '▼') : '⇅') + '</span></th>';
                html += '<th onclick="sortTable(\'maxGuests\')" class="' + (sortColumn === 'maxGuests' ? 'sorted' : '') + '">Max Guests<span class="sort-arrow">' + (sortColumn === 'maxGuests' ? (sortDirection === 'asc' ? '▲' : '▼') : '⇅') + '</span></th>';
                html += '<th onclick="sortTable(\'events\')" class="' + (sortColumn === 'events' ? 'sorted' : '') + '">Events<span class="sort-arrow">' + (sortColumn === 'events' ? (sortDirection === 'asc' ? '▲' : '▼') : '⇅') + '</span></th>';
                html += '<th onclick="sortTable(\'email\')" class="' + (sortColumn === 'email' ? 'sorted' : '') + '">Email<span class="sort-arrow">' + (sortColumn === 'email' ? (sortDirection === 'asc' ? '▲' : '▼') : '⇅') + '</span></th>';
                html += '<th>Actions</th>';
                html += '</tr></thead><tbody>';
                filteredGuests.forEach((g) => {
                    html += '<tr>';
                    html += '<td>' + escapeHtml(g.guest_name) + '</td>';
                    html += '<td><strong>' + escapeHtml(g.token) + '</strong></td>';
                    html += '<td>' + (g.max_guests || 2) + '</td>';
                    const events = g.event_access || [];
                    html += '<td>' + (events.length > 0 ? escapeHtml(events.join(', ')) : 'None') + '</td>';
                    html += '<td>' + escapeHtml(g.email || 'N/A') + '</td>';
                    html += '<td style="white-space: nowrap;">';
                    html += '<button class="action-btn resend-btn" data-token="' + escapeHtml(g.token) + '" onclick="resendInvite(this.getAttribute(\'data-token\'))">Resend</button>';
                    html += '<button class="action-btn delete-btn" data-token="' + escapeHtml(g.token) + '" data-name="' + escapeHtml(g.guest_name) + '" onclick="deleteGuest(this.getAttribute(\'data-token\'), this.getAttribute(\'data-name\'))">Delete</button>';
                    html += '</td>';
                    html += '</tr>';
                });
                html += '</tbody></table>';
            }
            document.getElementById('guests').innerHTML = html;
        }

        // Event listeners
        document.getElementById('loginBtn').addEventListener('click', doLogin);
        document.getElementById('logoutBtn').addEventListener('click', logout);
        document.getElementById('addGuestBtn').addEventListener('click', addGuest);
        document.getElementById('excelFile').addEventListener('change', previewExcel);
        document.getElementById('uploadBtn').addEventListener('click', uploadExcel);
        document.getElementById('loadGuestsBtn').addEventListener('click', loadGuests);
        document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDelete);
        document.getElementById('cancelDeleteBtn').addEventListener('click', closeModal);

        document.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !auth) {
                doLogin();
            }
        });
    </script>
</body>
</html>`
            };
        }
        
        // Create API server instance
        const apiServer = new WeddingAPIServer();
        
        // Initialize database connection
        await apiServer.initializeDatabase();
        
        // Parse the Lambda event into HTTP request format
        const normalizedHeaders = {};
        if (event.headers) {
            Object.keys(event.headers).forEach(key => {
                normalizedHeaders[key.toLowerCase()] = event.headers[key];
            });
        }
        
        const request = {
            method: event.httpMethod,
            url: event.path + (event.queryStringParameters ? '?' + new URLSearchParams(event.queryStringParameters).toString() : ''),
            headers: normalizedHeaders,
            body: event.body,
            _lambdaBody: event.body,
            _isLambda: true,
            query: event.queryStringParameters || {}
        };
        
        let responseData = {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': 'https://www.yourdomain.com',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Credentials': 'true'
            },
            body: ''
        };
        
        const response = {
            writeHead: (statusCode, headers) => {
                responseData.statusCode = statusCode;
                if (headers) {
                    responseData.headers = { ...responseData.headers, ...headers };
                }
            },
            setHeader: (name, value) => {
                if (!responseData.headers) responseData.headers = {};
                responseData.headers[name] = value;
            },
            getHeader: (name) => {
                return responseData.headers[name];
            },
            end: (data) => {
                const contentType = responseData.headers['Content-Type'] || '';
                console.log('📤 response.end() called:', {
                    isBuffer: Buffer.isBuffer(data),
                    dataType: typeof data,
                    contentType: contentType,
                    dataLength: data?.length
                });
                
                // Check if this is binary data (Excel file)
                if (Buffer.isBuffer(data) && contentType.includes('spreadsheetml')) {
                    console.log('📦 Binary Excel data detected, encoding as base64');
                    responseData.body = data.toString('base64');
                    responseData.isBase64Encoded = true;
                } else {
                    responseData.body = data || '';
                }
            },
            headersSent: false
        };
        
        request.connection = {
            remoteAddress: event.requestContext?.identity?.sourceIp || 'unknown'
        };
        request.socket = request.connection;
        
        await apiServer.handleRequest(request, response);
        
        // Ensure CORS headers are always set correctly
        const origin = event.headers?.origin || event.headers?.Origin || 'https://www.yourdomain.com';
        const allowedOrigins = [
            'https://www.yourdomain.com',
            'https://yourdomain.com',
            'http://localhost:3000',
            'http://127.0.0.1:3000'
        ];
        
        const corsOrigin = allowedOrigins.includes(origin) ? origin : 'https://www.yourdomain.com';
        
        // Set CORS headers - these will override any existing headers
        responseData.headers = {
            ...responseData.headers,
            'Access-Control-Allow-Origin': corsOrigin,
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Max-Age': '86400'
        };
        
        console.log('Response headers:', responseData.headers);
        console.log('Response status:', responseData.statusCode);
        
        return responseData;
        
    } catch (error) {
        console.error('Lambda handler error:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            body: JSON.stringify({
                success: false,
                error: 'Internal server error'
            })
        };
    }
};
