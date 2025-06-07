
  $(function () {
    function compactionCode(s) {
      s = s.replace(/\s*\;\s*/g, ";");
      s = s.replace(/\s*\=\s*/g, "=");
      s = s.replace(/\s*\(\s*/g, "(");
      s = s.replace(/\s*\)\s*/g, ")");
      s = s.replace(/\s*\{\s*/g, "{");
      s = s.replace(/\s*\}\s*/g, "}");
      s = s.replace(/\s*\,\s*/g, ",");
      s = s.replace(/\s+/g, " ");

      s = s.replace(/^\s*/g, "");
      s = s.replace(/\s*$/g, "");
      return s;
    }

    function convert() {
      var outputArea = $("#output-area");
      outputArea.empty();
      var s = compactionCode($('#bookmarklet-script').val());
      var buffer = "";
      var bookmarklet = "javascript:" + s + "void(0);";
      var bookmarkletEncoded = "javascript:" + encodeURIComponent(s) + "void(0);";

      var a = $('<a />').addClass("btn").addClass("btn-success").attr('href', bookmarkletEncoded).text($('#bookmarklet-name').val());
      var helpText = $('<small />').text('これをブックマークツールバーにドラッグ&ドロップ');
      outputArea.append($('<hr />'));
      outputArea.append(a);
      outputArea.append(helpText);


    }

    function executeEval() {
      try {
        var s = $('#bookmarklet-script').val();
        eval(s);
      } catch (e) {
        alert(e);
      }
    }

    function alertWithoutEncoding() {
      var s = $('#bookmarklet-script').val();
      s = compactionCode(s);
      alert(s);
    }

    $('#btn-convert').click(function () {
      convert();
      return false;
    });

    $('#btn-execute').click(function () {
      executeEval();
      return false;
    });

  });
