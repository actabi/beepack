// Beepack - Frontend JavaScript

const API_BASE = '/api/v1';

document.addEventListener('DOMContentLoaded', async function() {
    console.log('🐝 Beepack initializing...');
    
    // Load stats
    await loadStats();
    
    // Load packages
    await loadPackages();
    
    // Setup search
    setupSearch();
    
    // Setup smooth scroll
    setupSmoothScroll();
    
    console.log('🐝 Beepack loaded!');
});

// Load and display stats
async function loadStats() {
    try {
        const response = await fetch(`${API_BASE}/stats`);
        if (response.ok) {
            const stats = await response.json();
            
            // Update hero stats
            const statElements = document.querySelectorAll('.stat');
            statElements.forEach(el => {
                const label = el.querySelector('.stat-label')?.textContent;
                const valueEl = el.querySelector('.stat-value');
                if (!valueEl) return;
                
                if (label === 'packages') {
                    valueEl.textContent = stats.totalPackages || 0;
                } else if (label === 'likes') {
                    valueEl.textContent = stats.totalLikes || 0;
                } else if (label === 'downloads') {
                    valueEl.textContent = formatNumber(stats.totalDownloads || 0);
                }
            });
        }
    } catch (e) {
        console.log('Stats not available (API may be offline)');
    }
}

// Load and display packages
async function loadPackages() {
    const packagesGrid = document.querySelector('.packages-grid');
    if (!packagesGrid) return;
    
    try {
        const response = await fetch(`${API_BASE}/packages?limit=6&sort=downloads`);
        if (response.ok) {
            const data = await response.json();
            
            if (data.packages && data.packages.length > 0) {
                packagesGrid.innerHTML = data.packages.map(pkg => `
                    <div class="package-card">
                        <div class="package-header">
                            <span class="package-icon">${getPackageIcon(pkg.keywords)}</span>
                            <div class="package-stats-mini">
                                <span>👍 ${pkg.stats.likes}</span>
                                <span>👎 ${pkg.stats.dislikes}</span>
                                <span>📥 ${formatNumber(pkg.stats.downloads)}</span>
                            </div>
                        </div>
                        <h4>${pkg.displayName}</h4>
                        <p class="package-description">${pkg.description}</p>
                        <div class="package-meta">
                            <span class="package-version">v${pkg.version}</span>
                            <span class="package-author">by ${pkg.owner.handle}</span>
                        </div>
                        <div class="package-tags">
                            ${pkg.security === 'clean' ? '<span class="tag" style="background:#d1fae5;color:#065f46">&#9989; Scanned</span>' : ''}
                            ${pkg.keywords.slice(0, 3).map(k => `<span class="tag">${k}</span>`).join('')}
                        </div>
                        <a href="/package.html?slug=${pkg.slug}" class="btn btn-sm btn-outline">View details</a>
                    </div>
                `).join('');
            }
        }
    } catch (e) {
        console.log('Packages not available (API may be offline)');
    }
}

// Setup search functionality
function setupSearch() {
    const searchInput = document.querySelector('.search-input');
    const searchBtn = document.querySelector('.search-box .btn');
    
    if (searchInput && searchBtn) {
        searchBtn.addEventListener('click', () => handleSearch(searchInput.value));
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') handleSearch(searchInput.value);
        });
    }
}

async function handleSearch(query) {
    if (!query.trim()) return;
    window.location.href = `/search.html?q=${encodeURIComponent(query)}`;
}

function displaySearchResults(data) {
    // For now, show in alert - later can add a modal
    if (data.results.length === 0) {
        alert(`No results for "${data.query}"`);
        return;
    }
    
    const resultsText = data.results.map(r => 
        `• ${r.displayName} (👍${r.stats.likes}) - ${r.description.slice(0, 50)}...`
    ).join('\n');
    
    alert(`🔍 ${data.results.length} result(s) for "${data.query}":\n\n${resultsText}\n\n(${data.searchTime}ms)`);
}

// Setup smooth scroll
function setupSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href === '#' || href === '#login') return;
            
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
    
    // GitHub OAuth login
    document.querySelectorAll('a[href="#login"]').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            window.location.href = '/auth/github';
        });
    });
}

// Helper functions
function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
}

function getPackageIcon(keywords) {
    const iconMap = {
        'notion': '📝',
        'stripe': '💳',
        'payment': '💳',
        'openai': '🤖',
        'ai': '🤖',
        'github': '🐙',
        'supabase': '⚡',
        'database': '🗄️',
        'auth': '🔐',
        'email': '📧',
        'api': '🔌'
    };
    
    for (const keyword of keywords) {
        if (iconMap[keyword.toLowerCase()]) {
            return iconMap[keyword.toLowerCase()];
        }
    }
    return '📦';
}
