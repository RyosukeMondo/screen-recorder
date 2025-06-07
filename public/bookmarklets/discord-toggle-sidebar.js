(function(){
  const toggleDiscordSidebar = () => {
    if (window.location.hostname.includes('discord.com')) {
      console.log('Discord Sidebar Toggle activated');
      
      // Find the server sidebar using its aria-label
      // Note: The aria-label "サーバー サイドバー" means "Server Sidebar" in Japanese
      let serverSidebar = document.querySelector('nav[aria-label="サーバー サイドバー"]');
      
      // Try English version if Japanese not found
      if (!serverSidebar) {
        serverSidebar = document.querySelector('nav[aria-label="Servers sidebar"]');
      }
      
      // Try to find by class if aria-label approach fails
      if (!serverSidebar) {
        serverSidebar = document.querySelector('nav[class*="guilds"]');
      }
      
      if (serverSidebar) {
        // Get the parent node to handle the whole sidebar section
        const parentElement = serverSidebar.parentElement;
        
        if (parentElement) {
          // Check the current display state
          const isHidden = window.getComputedStyle(parentElement).display === 'none';
          
          // Toggle visibility
          if (isHidden) {
            parentElement.style.display = '';
            console.log('Discord sidebar shown');
            // Add visual indicator that sidebar is visible
            const indicator = document.createElement('div');
            indicator.id = 'sidebar-indicator';
            indicator.style.position = 'fixed';
            indicator.style.top = '10px';
            indicator.style.left = '10px';
            indicator.style.background = 'rgba(0, 255, 0, 0.5)';
            indicator.style.padding = '5px';
            indicator.style.borderRadius = '5px';
            indicator.style.zIndex = '9999';
            indicator.style.fontSize = '12px';
            indicator.textContent = 'Sidebar Visible';
            document.body.appendChild(indicator);
            setTimeout(() => {
              if (document.getElementById('sidebar-indicator')) {
                document.getElementById('sidebar-indicator').remove();
              }
            }, 2000);
          } else {
            parentElement.style.display = 'none';
            console.log('Discord sidebar hidden');
            // Add visual indicator that sidebar is hidden
            const indicator = document.createElement('div');
            indicator.id = 'sidebar-indicator';
            indicator.style.position = 'fixed';
            indicator.style.top = '10px';
            indicator.style.left = '10px';
            indicator.style.background = 'rgba(255, 0, 0, 0.5)';
            indicator.style.padding = '5px';
            indicator.style.borderRadius = '5px';
            indicator.style.zIndex = '9999';
            indicator.style.fontSize = '12px';
            indicator.textContent = 'Sidebar Hidden';
            document.body.appendChild(indicator);
            setTimeout(() => {
              if (document.getElementById('sidebar-indicator')) {
                document.getElementById('sidebar-indicator').remove();
              }
            }, 2000);
          }
          
          return true;
        }
      }
      
      // Try to find channel sidebar as fallback
      const channelSidebar = document.querySelector('nav[aria-label*="Channel"], nav[aria-label*="チャンネル"], div[class*="sidebar"]');
      if (channelSidebar) {
        const isHidden = window.getComputedStyle(channelSidebar).display === 'none';
        
        if (isHidden) {
          channelSidebar.style.display = '';
          console.log('Channel sidebar shown');
        } else {
          channelSidebar.style.display = 'none';
          console.log('Channel sidebar hidden');
        }
        return true;
      }
      
      alert('Could not find Discord sidebar!');
      return false;
    } else {
      alert('This bookmarklet only works on Discord!');
      return false;
    }
  };
  
  toggleDiscordSidebar();
})();
